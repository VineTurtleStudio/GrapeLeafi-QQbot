// 首次运行引导：config.json 不存在时自动套用 config.example.json。
//
// 为什么需要它：早先这里是「文件不在就 process.exit(1)」，而 install.bat 也从不创建它，
// 于是新人 clone 下来双击 start.bat 只会看到一句
// 「无法读取配置文件 ...: ENOENT」就退出，完全不知道该干嘛。
// 改成拿模板当默认值启动后，控制台能直接开起来，他可以在网页里填自己的 QQ 号，
// 保存后自动落成 config.json —— 相当于「外壳自带、设置自填」。

import { readFileSync } from "node:fs";
import { isUnfilled } from "./setup.js";

function readJSONFile(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

/**
 * 读配置，三种结局：
 *   { config, bootstrapped:false, fatal:null }            正常读到 config.json
 *   { config, bootstrapped:true,  fatal:null, warnings }  没有 config.json，用了模板
 *   { config:null, fatal:"..." }                          无法启动，需要人工处理
 *
 * 刻意不直接 process.exit：留成返回值才能写单测（import 本模块不会启动 bot）。
 * 也不在这里打日志，方便测试断言。
 */
export function loadConfigWithBootstrap(configPath, examplePath) {
  const warnings = [];

  let config;
  let bootstrapped = false;
  try {
    config = readJSONFile(configPath);
  } catch (err) {
    // 只对「文件不存在」降级。JSON 语法错误必须照旧硬失败：
    // 那种情况多半是主人手滑改坏了，静默换成默认值会让人以为保存成功，
    // 下一次保存就会把原配置覆盖掉 —— 这是最典型的静默数据丢失路径。
    if (err.code !== "ENOENT") {
      return {
        config: null,
        bootstrapped: false,
        fatal: `配置文件解析失败 ${configPath}: ${err.message}。请手动修正该文件的 JSON 语法后重启；程序不会用默认值覆盖它。`,
        warnings,
      };
    }
    let example;
    try {
      example = readJSONFile(examplePath);
    } catch (exErr) {
      return {
        config: null,
        bootstrapped: false,
        fatal: `找不到配置文件 ${configPath}，且模板 ${examplePath} 也不可用: ${exErr.message}。请从 config.example.json 复制一份改名为 config.json 再启动。`,
        warnings,
      };
    }
    config = example;
    bootstrapped = true;
  }

  if (bootstrapped) {
    warnings.push(
      `首次运行：未找到 config.json，已套用 config.example.json`,
      `请打开控制台填入自己的 QQ 号，保存后会自动写入 ${configPath}`,
      `模板位置：${examplePath}`,
    );
  }

  const admins = Array.isArray(config?.bot?.adminIds) ? config.bot.adminIds : [];
  if (isUnfilled(admins)) {
    // 用 isUnfilled 判定，「算占位符」的定义只有 setup.js 一处。
    // 之前这里是另一份硬编码列表，模板从 123456789 改成 ****** 之后就漏判了。
    warnings.push(
      `主人 QQ 号还没填（bot.adminIds = ${JSON.stringify(admins)}）。` +
      `只有 /设置、/修复 这类主人指令需要它，日常聊天/签到/图鉴/扭蛋都不需要，留空也能正常玩。` +
      `要填就填你**用来跟机器人聊天**的那个号：不能填登录机器人的这个号，` +
      `机器人会忽略自己发的消息（防关键字回环），填了等于没人有主人权限。` +
      `控制台「设置」页可填。`,
    );
  }

  return { config, bootstrapped, fatal: null, warnings };
}
