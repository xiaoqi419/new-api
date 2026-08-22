export const APP_VERSION = __APP_VERSION__ || "dev";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";

// 官方插件清单地址:上游默认经 jsDelivr 远程拉取,但插件源码只允许同源加载
// (见 lib/canvas/plugin-loader.ts),远程清单里的条目一个都装不上、列出来只会误导,
// 因此改为读同源清单 public/official-plugins.json(默认为空)。
// 要提供插件时,把插件文件随镜像发布并写进这份清单,或用环境变量指回上游来源。
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || `${import.meta.env.BASE_URL}official-plugins.json`;
