const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// The userscript contains two copies of the webpack bundle. Only the second,
// locally maintained copy is executed; load individual modules without a DOM
// dependency so their courseware and navigation behavior can be tested.
const source = fs.readFileSync(path.join(__dirname, '../src/script1.js'), 'utf8');
function loadModule(name, dependencies, globals = {}) {
    const marker = `/***/ "./src/mooc/chaoxing/${name}.ts":`;
    const start = source.lastIndexOf(marker);
    assert.notEqual(start, -1, `${name} module is present`);
    const open = source.indexOf('/***/ (function(module, exports, __webpack_require__) {', start);
    const body = source.slice(open + '/***/ (function(module, exports, __webpack_require__) {'.length,
        source.indexOf('\n/***/ }),', open));
    const run = vm.runInNewContext(`(function (module, exports, __webpack_require__) {${body}\n})`,
        { Promise, setTimeout, clearTimeout, ...globals });
    const module = { exports: {} };
    run(module, module.exports, id => dependencies[id] || {});
    return module.exports;
}

function loadDocumentTask() {
    function Task(context, taskinfo) {
        this.context = context;
        this.taskinfo = taskinfo;
        this.events = [];
    }
    Task.prototype.Done = function () { return !!this.done; };
    Task.prototype.callEvent = function (name) {
        if (name === 'complete') this.done = true;
        this.events.push(name);
    };
    return loadModule('special', {
        './src/mooc/chaoxing/task.ts': { CxTask: Task, CxTaskControlBar: function () {} },
        './src/mooc/chaoxing/video.ts': { CxVideoOptimization: function () {}, Video: function () {}, CxVideoControlBar: function () {} },
        './src/internal/application.ts': { Application: { App: { config: { auto: true }, log: { Warn() {} } } } },
    }).CxDocumentTask;
}

function makeViewer({ height = 100, total = 350 } = {}) {
    const viewer = {
        clientHeight: height, scrollHeight: total, scrollTop: 0, events: [],
        dispatchEvent(event) { this.events.push(event.type); },
    };
    const root = { clientHeight: 100, scrollHeight: 100, scrollTop: 0 };
    const document = {
        scrollingElement: root,
        querySelectorAll(selector) { return selector === '*' ? [viewer] : []; },
        querySelector() { return null; },
    };
    return { viewer, document };
}

function makeWindow(document) {
    const timers = [];
    let marked = false;
    const window = {
        document, timers,
        Event: class { constructor(type) { this.type = type; } },
        getComputedStyle: () => ({ overflowY: 'auto' }),
        setTimeout(fn) { timers.push(fn); return timers.length; },
        clearTimeout() {},
        frameElement: { closest: () => marked ? {} : null },
        tick() { assert.ok(timers.length, 'a next step is scheduled'); timers.shift()(); },
        setMarked(value) { marked = value; },
    };
    return window;
}

test('Firefox grants and /mooc-ans course page are in the userscript metadata', () => {
    const metadata = source.slice(0, source.indexOf('// ==/UserScript=='));
    assert.match(metadata, /@grant\s+GM_getValue/);
    assert.match(metadata, /@grant\s+GM_setValue/);
    assert.match(metadata, /@match\s+\*:\/\/\*\/mooc-ans\/mycourse\/studentstudy\?\*/);
});

test('HTML5 autoplay fallback finds video in a nested course frame but ignores PDF pages', () => {
    const start = source.indexOf('(function keepCourseVideoPlaying() {');
    const end = source.indexOf('(function autoScrollCourseware() {', start);
    assert.ok(start > 0 && end > start);
    const runner = source.slice(start, end);
    const video = {
        paused: true, ended: false, src: '/video.mp4', muted: false,
        play() { this.calls = (this.calls || 0) + 1; return Promise.resolve(); },
    };
    const child = { querySelectorAll: selector => selector === 'video' ? [video] : [] };
    const frame = { contentDocument: child, closest: () => null };
    const parent = {
        hidden: false,
        addEventListener() {},
        querySelectorAll: selector => selector === 'iframe' ? [frame] : [],
    };
    const timers = [];
    const globals = {
        location: { pathname: '/mooc-ans/mycourse/studentstudy' }, document: parent,
        localStorage: {}, WeakSet, Promise, console,
        setInterval(fn) { timers.push(fn); },
    };
    vm.runInNewContext(runner, globals);
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(video.calls, 1);
    assert.equal(video.muted, true);
    globals.localStorage.cx_auto = 'false';
    timers[0]();
    assert.equal(video.calls, 1, 'paused automation does not force video playback');
    globals.localStorage.cx_auto = 'true';
    frame.closest = () => ({});
    timers[0]();
    assert.equal(video.calls, 1, 'already finished video is not restarted');
    globals.location.pathname = '/ananas/modules/pdf/index.html';
    vm.runInNewContext(runner, globals);
    assert.equal(timers.length, 1, 'PDF page has no video autoplay timer');
});

test('video task discovers HTML5 players inside newer nested frames', () => {
    function Task(context, info) { this.context = context; this.taskinfo = info; }
    const Video = loadModule('video', {
        './src/mooc/chaoxing/task.ts': { CxTask: Task, CxTaskControlBar: function () {} },
    }).Video;
    const video = { paused: true };
    const doc = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [{ contentDocument: { querySelector: () => video } }],
    };
    assert.equal(new Video({ document: doc }, {}).queryVideo(), video);
});

test('PDF page scrolls its viewer even when the parent did not register a document task', () => {
    const start = source.indexOf('(function autoScrollCourseware() {');
    const end = source.indexOf('// The legacy bundle in this wrapper', start);
    assert.ok(start > 0 && end > start);
    const runner = source.slice(start, end);
    const events = [];
    const viewer = {
        clientHeight: 200, scrollHeight: 550, scrollTop: 0,
        dispatchEvent: event => events.push(event.type),
    };
    const root = { clientHeight: 400, scrollHeight: 400, scrollTop: 0 };
    const doc = {
        body: {}, hidden: false, scrollingElement: root,
        addEventListener() {},
        querySelectorAll: selector => selector === '#viewerContainer, #pdfViewer, .pdfViewer, .pptViewer, [id*="scroll"], [class*="scroll"]' || selector === '*' ? [viewer] : [],
    };
    let marked = false;
    const win = {
        document: doc,
        Event: class { constructor(type) { this.type = type; } },
        getComputedStyle: () => ({ overflowY: 'auto' }),
        frameElement: { closest: () => marked ? {} : null },
    };
    const timers = [];
    let stopped = false;
    vm.runInNewContext(runner, {
        location: { pathname: '/ananas/modules/pdf/index.html' }, document: doc,
        window: win, localStorage: {}, console: { info() {}, warn() {} }, clearInterval: () => { stopped = true; },
        setInterval: fn => { timers.push(fn); return 1; },
    });
    assert.equal(timers.length, 1);
    timers[0](); timers[0](); timers[0]();
    assert.equal(viewer.scrollTop, 350);
    assert.deepEqual(events, ['scroll', 'scroll', 'scroll']);
    assert.equal(root.scrollTop, 0);
    assert.equal(stopped, false);
    marked = true;
    timers[0]();
    assert.equal(stopped, true);
});

test('PDF scroller ignores other pages and respects the pause setting', () => {
    const start = source.indexOf('(function autoScrollCourseware() {');
    const end = source.indexOf('// The legacy bundle in this wrapper', start);
    const runner = source.slice(start, end);
    const root = { clientHeight: 100, scrollHeight: 300, scrollTop: 0, dispatchEvent() {} };
    const doc = {
        body: {}, hidden: false, scrollingElement: root,
        addEventListener() {}, querySelectorAll: () => [],
    };
    const win = { document: doc, Event: class {}, frameElement: null };
    const timers = [];
    const localStorage = { cx_auto: 'false' };
    const env = {
        location: { pathname: '/ananas/modules/video/index.html' }, document: doc,
        window: win, localStorage, console: { info() {}, warn() {} }, clearInterval() {},
        setInterval(fn) { timers.push(fn); return 1; },
    };
    vm.runInNewContext(runner, env);
    assert.equal(timers.length, 0);
    env.location.pathname = '/ananas/modules/pdf/index.html';
    vm.runInNewContext(runner, env);
    timers[0]();
    assert.equal(root.scrollTop, 0);
    localStorage.cx_auto = 'true';
    timers[0]();
    assert.ok(root.scrollTop > 0);
});

test('PDF scroller warns once if the reader has no scrollable container', () => {
    const start = source.indexOf('(function autoScrollCourseware() {');
    const end = source.indexOf('// The legacy bundle in this wrapper', start);
    const root = { clientHeight: 300, scrollHeight: 300, scrollTop: 0 };
    const doc = { body: {}, hidden: false, scrollingElement: root, addEventListener() {}, querySelectorAll: () => [] };
    const win = { document: doc, frameElement: null };
    const warnings = [];
    let tick;
    vm.runInNewContext(source.slice(start, end), {
        location: { pathname: '/ananas/modules/pdf/index.html' }, document: doc, window: win,
        localStorage: {}, console: { warn: text => warnings.push(text) }, clearInterval() {},
        setInterval(fn) { tick = fn; return 1; },
    });
    for (let i = 0; i < 15; i++) tick();
    assert.equal(warnings.length, 1);
});

test('PPT viewer scrolls in steps and advances only after the platform marks it complete', async () => {
    const { viewer, document } = makeViewer();
    const window = makeWindow(document);
    let finishCalls = 0;
    window.finishJob = () => { finishCalls++; };
    const Task = loadDocumentTask();
    const task = new Task(window, { job: true });
    await task.Start();
    for (let i = 0; i < 3; i++) window.tick();
    assert.equal(viewer.scrollTop, 250);
    assert.equal(viewer.events.length, 3);
    assert.deepEqual(task.events, []);
    window.tick();
    assert.equal(finishCalls, 0, 'do not force completion before the viewing-time requirement');
    assert.deepEqual(task.events, [], 'scrolling to the bottom is not server confirmation');
    window.setMarked(true);
    window.tick();
    assert.deepEqual(task.events, ['complete']);
    await task.Start();
    assert.equal(window.timers.length, 0, 'no duplicate polling after completion');
});

test('old PPT next-page button still works, including an already-final slide', async () => {
    const { document } = makeViewer({ total: 100 });
    let clicks = 0;
    const button = {
        style: { visibility: 'visible' }, hidden: false, disabled: false,
        getAttribute() { return null; },
        click() { if (++clicks === 2) this.style.visibility = 'hidden'; },
    };
    document.querySelector = () => button;
    const window = makeWindow(document);
    const Task = loadDocumentTask();
    const task = new Task(window, { job: true });
    await task.Start();
    window.tick();
    window.tick();
    window.tick();
    assert.equal(clicks, 2);
    assert.deepEqual(task.events, ['complete']);
});

function loadCourse(document, factory = {}) {
    function EventListener() { this.events = []; }
    EventListener.prototype.callEvent = function (name, ...args) { this.events.push([name, ...args]); };
    const { CxCourse } = loadModule('course', {
        './src/internal/utils/event.ts': { EventListener },
        './src/internal/application.ts': { Application: { App: { log: { Info() {} } } } },
        './src/mooc/chaoxing/factory.ts': { TaskFactory: factory },
    }, { document });
    return new CxCourse();
}

function row({ unfinished = false, locked = false } = {}) {
    const count = unfinished ? { parentElement: { querySelector: () => null } } : null;
    return {
        clicked: 0,
        matches: () => locked,
        querySelector: selector => selector === '.jobUnfinishCount' ? count : null,
        click() { this.clicked++; },
    };
}

test('course switches to the next card in the modern chapter view', () => {
    const next = row();
    const current = { nextElementSibling: next };
    const document = { querySelector: selector => selector === '.prev_ul li.active' ? current : null };
    const course = loadCourse(document);
    course.nextPage(null);
    assert.equal(next.clicked, 1);
    assert.deepEqual(course.events, []);
});

test('original course view still uses its next-page button', () => {
    const next = row();
    const document = {
        querySelector: selector => selector === 'span.currents ~ span' ? next : null,
    };
    loadCourse(document).nextPage(null);
    assert.equal(next.clicked, 1);
});

test('course switches to the next unfinished chapter and does not skip locked chapters', () => {
    const selected = row();
    selected.closest = () => selected;
    const locked = row({ locked: true, unfinished: true });
    const target = row({ unfinished: true });
    const document = {
        querySelector: selector => selector === '.posCatalog_active' ? selected : null,
        querySelectorAll: () => [selected, locked, target],
    };
    const course = loadCourse(document);
    course.nextPage(null);
    assert.equal(locked.clicked, 0);
    assert.equal(target.clicked, 1);
});

test('an already loaded mooc2 task iframe initializes once in Firefox', async () => {
    const task = { Init: () => Promise.resolve(), Done: () => false, addEventListener() {} };
    const frame = {
        id: 'studentFrame', tagName: 'IFRAME',
        contentDocument: { readyState: 'complete' },
        contentWindow: { mArg: { attachments: [{ type: 'video' }], defaults: {} } },
    };
    let onLoad;
    const document = {
        addEventListener(_event, callback) { onLoad = callback; },
        querySelectorAll: () => [frame],
    };
    const course = loadCourse(document, { CreateCourseTask: () => task });
    await course.Init();
    assert.equal(course.taskList.length, 1);
    onLoad({ target: frame });
    assert.equal(course.events.filter(([name]) => name === 'reload').length, 1);
});

test('PPT attachments without a jobid iframe are still recognized', () => {
    function DocumentTask(context, info) { this.context = context; this.info = info; }
    function ControlBar(_previous, task) { this.task = task; }
    ControlBar.prototype.download = () => null;
    ControlBar.prototype.append = () => {};
    const frame = { contentWindow: {}, parentElement: { prepend() {} } };
    const factory = loadModule('factory', {
        './src/mooc/chaoxing/special.ts': { CxDocumentTask: DocumentTask },
        './src/mooc/chaoxing/task.ts': { CxTaskControlBar: ControlBar },
        './src/internal/application.ts': { Application: { App: { config: { video_mute: true, video_multiple: 1 } } } },
    }, { document: { createElement: () => ({}) } }).TaskFactory;
    const info = { type: 'ppt', property: { module: 'ppt' }, jobid: 'new', job: true };
    const context = { document: {
        querySelector: () => null,
        querySelectorAll: () => [frame],
    } };
    const task = factory.CreateCourseTask(context, info);
    assert.ok(task instanceof DocumentTask);
    assert.equal(info.type, 'document');
});

test('skipped attachment indexes do not skip the next supported task', async () => {
    const task = {
        Init: () => Promise.resolve(),
        Done: () => false,
        addEventListener(name, fn) { if (name === 'complete') this.complete = fn; },
    };
    const factory = { CreateCourseTask(_win, attachment) { return attachment.skip ? null : task; } };
    const course = loadCourse({}, factory);
    await course.OperateCard({ contentWindow: {
        mArg: { attachments: [{ skip: true }, { skip: false }], defaults: {} },
    } });
    task.complete();
    assert.equal(course.events.find(([name]) => name === 'taskComplete')[1], 0);
});

test('an already completed video does not block later tasks while initializing', async () => {
    const doneVideo = {
        Done: () => true,
        Init: () => { throw new Error('completed video should not initialize its player'); },
        addEventListener() {},
    };
    const pendingPdf = { Done: () => false, Init: () => Promise.resolve(), addEventListener() {} };
    const course = loadCourse({}, {
        CreateCourseTask: (_win, attachment) => attachment.type === 'video' ? doneVideo : pendingPdf,
    });
    await course.OperateCard({ contentWindow: { mArg: {
        attachments: [{ type: 'video' }, { type: 'document' }], defaults: {},
    } } });
    assert.equal(course.taskList.length, 2);
    assert.equal(await course.Next(), doneVideo);
    assert.equal(await course.Next(), pendingPdf);
});

test('course completes rather than clicking already completed modern chapters', () => {
    const selected = row();
    selected.closest = () => selected;
    const done = row();
    const document = {
        querySelector: selector => selector === '.posCatalog_active' ? selected : null,
        querySelectorAll: () => [row({ unfinished: true }), selected, done],
    };
    const course = loadCourse(document);
    course.nextPage(null);
    assert.equal(done.clicked, 0);
    assert.deepEqual(course.events, [['complete']]);
});
