// =====================================================================
// main.js: 应用主入口 (总指挥) - (重构版)
// 版本: v2.2
// 职责: 1. 加载 UI 交互 (ui.js)
//        2. 加载 CoolProp 物性库 (coolprop_loader.js)
//        3. 在物性库加载成功后, 初始化所有计算模式 (Mode 2, 3)
// =====================================================================

// 1. 导入所有需要的模块
import { loadCoolProp, updateFluidInfo } from './coolprop_loader.js';
// (重构版) 移除 mode1, 只导入模式 2 和 3
import { initMode2 } from './mode2_oil_refrig.js';
import { initMode3 } from './mode3_oil_gas.js';

// 2. 导入并执行 UI 交互脚本
// (这个导入会执行 ui.js 里的 'DOMContentLoaded' 监听器)
import './ui.js'; 

// 3. 主应用逻辑: 等待 DOM 加载完毕
document.addEventListener('DOMContentLoaded', () => {

    // 4. (重构版) 定义剩余模式需要被更新状态的元素
    const buttons = [
        document.getElementById('calc-button-mode-2'),
        document.getElementById('calc-button-mode-3')
    ];
    
    const fluidInfos = [
        { select: document.getElementById('fluid_m2'), info: document.getElementById('fluid-info-m2') },
        { select: document.getElementById('fluid_m3'), info: document.getElementById('fluid-info-m3') }
    ];

    // (重构版) 更新按钮文本以匹配新的UI
    const buttonTexts = {
        'calc-button-mode-2': '计算 (模式一)',
        'calc-button-mode-3': '计算 (模式二)'
    };

    // 5. 开始异步加载 CoolProp 物性库
    loadCoolProp()
        .then((CP) => {
            // 6. (成功) 物性库加载成功!
            console.log("CoolProp loaded successfully.");

            // 6.1 (重构版) 初始化剩余的 2 个计算模块
            initMode2(CP);
            initMode3(CP);

            // 6.2 更新所有计算按钮的状态
            buttons.forEach(btn => {
                if (btn) {
                    btn.textContent = buttonTexts[btn.id] || "计算";
                    btn.disabled = false;
                }
            });
            
            // 6.3 更新所有物性显示框, 显示默认工质信息
            fluidInfos.forEach(fi => {
                if (fi.select && fi.info) {
                    // 触发一次 updateFluidInfo 来显示初始信息
                    updateFluidInfo(fi.select, fi.info, CP);
                }
            });

        })
        .catch((err) => {
            // 7. (失败) 物性库加载失败!
            console.error("Failed to load CoolProp:", err);
            const errorMsg = `物性库加载失败: ${err.message}`;
            
            // 7.1 禁用所有按钮并显示错误
            buttons.forEach(btn => {
                if (btn) {
                    btn.textContent = "物性库加载失败";
                    btn.disabled = true;
                }
            });
            
            // 7.2 在所有物性框显示错误
            fluidInfos.forEach(fi => {
                if (fi.info) {
                    fi.info.textContent = errorMsg;
                    fi.info.style.color = 'red';
                }
            });
        });
});