# UCAS-MOOC-AutoWatch

An automatic course-watching script for UCAS MOOC, implemented as a Tampermonkey userscript.

[中文版](README.md) | [English Version](REAMD-eng.md)

## Features

- ▶️ **Auto video playback**: videos start playing automatically when you enter a course page
- 📖 **Auto-scroll reading materials**: PDF/PPT courseware is scrolled step by step until the platform confirms the task is complete
- ⏭️ **Auto page navigation**: moves on to the next chapter once all task points in the current section are done
- 🧭 **New UI compatible**: supports both the legacy pages and the new `/mooc-ans` page structure

## Usage

Just three steps:

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Install this script: create a new userscript in Tampermonkey, paste the full contents of [script1.js](src/script1.js), and save
   (also available on [Greasy Fork](https://greasyfork.org/zh-CN/scripts/477309))
3. **Restart your browser** and open the UCAS online course page — that's it

The script takes care of the rest. No extra configuration needed.

## Notes

- Video tasks must reach the platform's required viewing duration (e.g. 90%) to count as complete
- The "100%" in the courseware toolbar is the zoom level, not task progress
- [script2.js](src/script2.js) is an optional auto course-selection script, independent of this one

## Local Testing

Requires Node.js:

```bash
node --test tests/script1.test.js
```
