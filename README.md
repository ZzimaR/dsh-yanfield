# 砚田

DeepSeek Harness 里的长篇写作台。侧栏打开「砚田」，写正文、大纲和资料。模型用 Harness 里已经配好的服务。改动先给你看，确认后才写入。

![写作台](docs/screenshots/workspace.png)

## 安装

需要 DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`。

```bash
dsh plugin --profile web add github:ZzimaR/dsh-yanfield
```

桌面版把 `web` 换成 `desktop`。装完重启。

仓库里已经带好构建产物，安装不会执行脚本。

## 书稿

默认在 `$DSH_HOME/yanfield/yanfield.db`。设置里可以打开这个文件所在的文件夹。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)。这个软件不可商用。用它写出来的小说，版权归作者。

写作台来自 [砚田](https://github.com/ZzimaR/Yanfield)。
