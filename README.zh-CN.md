# YuMiHDR

**面向非线性深空天文摄影的高级HDR处理插件（PixInsight）。**
专门处理 M42（猎户座大星云）、M81（波得星系）、仙女座核心以及含有IFN
（积分通量星云）背景等高动态范围目标，能够压缩明亮核心、还原暗区细节，
同时不会让阴影中的噪点出现失控。

> English: see [README.md](README.md)

---

## 安装

推荐通过 PixInsight 内置的更新机制安装。

1. 在 PixInsight 中打开 **RESOURCES &rarr; Updates &rarr; Manage Repositories**。
2. 点击 **Add**，粘贴下面的更新仓库地址：

       https://yumiastro.github.io/YuMiHDR/

3. 点击 **OK**，再选择 **RESOURCES &rarr; Updates &rarr; Check for Updates**。
4. 接受系统提示的更新，并在提示时**重启 PixInsight**。
5. 重启后通过 **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR** 启动插件。

### 手动安装（进阶用户）

1. 在 [Releases](https://github.com/YuMiAstro/YuMiHDR/releases) 下载
   `YuMiHDR-script-x.y.z.zip`。
2. 解压到 PixInsight 安装目录，使脚本文件最终位于
   `<PixInsightDir>/src/scripts/YuMiHDR/`。
3. 在 PixInsight 中：**SCRIPT &rarr; Feature Scripts... &rarr; Add**，
   选择刚才的 `src/scripts/YuMiHDR/` 文件夹。

---

## 功能亮点

- **多尺度HDR核心**：基于拉普拉斯金字塔的多尺度分解，逐像素自适应增益，
  自动压缩亮核、增强暗部结构。
- **柔和全局色调曲线**：MTF 中间调整形 + asinh 风格高光卷边 +
  以中值为锚的阴影抬升。
- **恒星保护**：基于亮度阈值的可膨胀掩膜，保留紧实的星点核心。
- **IFN / 暗背景增强**：仅作用于暗背景区域的 asinh 拉伸，在不放大噪点
  的前提下显著抬升 IFN。
- **保色复合**：可在“比例模式（保留 R:G:B 比）”与“加法模式
  （高光更稳）”之间切换。
- **实时分屏预览**：拖动绿色分割条对比前/后，滑块默认 80ms 内更新预览。
- **支持流程图标**：拖动 *New Instance* 图标到工作区可保存参数；将图标
  拖到视图上即可应用。

---

## 快速上手

1. 把图像先做好基本非线性拉伸（例如 `HistogramTransformation`、
   `ScreenTransferFunction &rarr; Auto stretch &rarr; HT`、或
   `GeneralizedHyperbolicStretch`）。
2. 启动 **SCRIPT &rarr; YuMiHDR &rarr; YuMiHDR**。
3. 在 **Target view** 下拉里选择目标视图，预览面板会自动填充。
4. 建议起点：
   - **M42 / 亮发射星云**：
     *Large-scale compression* 0.70，*Core compression* 0.65，
     *Star protection* 0.80，*IFN boost* 0.0。
   - **M81 / 星系**：
     *Large-scale compression* 0.55，*Mid-scale detail* 1.40，
     *Highlight rolloff* 0.45，*Local contrast* 0.55。
   - **IFN 暗场**：
     *Large-scale compression* 0.40，*Shadow lift* 0.40，
     *IFN boost* 0.55，*IFN threshold* 0.10，*Star protection* 0.85。
5. 拖动预览区中央绿色竖线，对比处理前后。
6. 满意后点 **Apply**。

更详细的参数说明见 [doc/parameters.md](doc/parameters.md)，
算法原理见 [doc/algorithm.md](doc/algorithm.md)。

---

## 工程结构

    src/scripts/YuMiHDR/         PJSR 源码（实际被安装的部分）
    repository/                  发布到更新 URL 的内容
        updates.xri              PixInsight 更新清单
        index.html               人类可读的安装说明页
        YuMiHDR-script-*.zip     由 tools/build.ps1 生成的安装包
    tools/build.ps1              打包脚本：生成 zip 并刷新 xri 中的 sha1
    doc/                         参数与算法文档

---

## 自行打包

需要 PowerShell 5.1+ 或 `pwsh`。在项目根目录执行：

    pwsh -File tools/build.ps1 -Version 1.0.0

会在 `dist/` 生成 zip，同时复制到 `repository/` 并自动更新
`repository/updates.xri` 中的 sha1 与发布日期。将 `repository/` 目录的
内容发布到你对外宣告的 URL 即可。

---

## 许可证

MIT，详见 [LICENSE](LICENSE)。
