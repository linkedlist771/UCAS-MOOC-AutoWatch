# UCAS-MOOC-AutoWatch

国科大慕课（MOOC）自动刷课脚本，通过油猴（Tampermonkey）实现。

[中文版](README.md) | [English Version](REAMD-eng.md)

## 功能特性

- ▶️ **自动播放视频**：进入课程页面后视频自动播放
- 📖 **滚动阅读材料**：PDF/PPT 课件自动逐步滚动，等待平台确认任务点完成
- ⏭️ **自动跳转下一页**：本节所有任务点完成后自动切换下一章节
- 🧭 **兼容新版页面**：同时支持新版 `/mooc-ans` 页面结构

## 使用方法

只需要三步：

1. 安装 [油猴（Tampermonkey）](https://www.tampermonkey.net/) 浏览器扩展
2. 安装本脚本：新建油猴脚本，复制 [script1.js](src/script1.js) 的全部内容保存即可
   （也可从 [Greasy Fork](https://greasyfork.org/zh-CN/scripts/477309) 安装）
3. **重启浏览器**，进入国科大在线课程页面即可

脚本会自动完成剩下的工作，无需其他配置。

## 说明

- 视频任务须播放到平台规定的观看时长（例如 90%）才算完成
- 课件底部的 "100%" 是缩放比例，不是任务进度
- [script2.js](src/script2.js) 为可选的自动选课脚本，与本脚本相互独立

## 本地测试

需要安装 Node.js：

```bash
node --test tests/script1.test.js
```
