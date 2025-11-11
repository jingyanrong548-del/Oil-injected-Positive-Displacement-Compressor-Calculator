// =====================================================================
// coolprop_loader.js: CoolProp 物性库加载器
// 版本: v4.6 (路径修复版)
// 职责: 1. 异步加载 CoolProp WASM 模块
//        2. (v4.6 修复) 明确提供 locateFile 路径，解决嵌套导入问题
// =====================================================================

// 导入 CoolProp JS 包装器
import Module from '../coolprop.js';

// 1. 异步加载函数
/**
 * 异步加载 CoolProp WASM 模块.
 * @returns {Promise<object>} 返回 CoolProp (CP) 实例.
 */
export async function loadCoolProp() {
    try {
        // ====================== 关键修复 (v4.6) ======================
        // 当 coolprop.js 被嵌套导入时, 其内部的 import.meta.url 会失效。
        // 我们必须创建一个配置对象 (moduleArgs)，并使用 locateFile
        // 明确告诉它 .wasm 文件在哪里（路径相对于 index.html）。
        
        const moduleArgs = {
            locateFile: (path, scriptDirectory) => {
                if (path.endsWith('.wasm')) {
                    // 返回 .wasm 文件相对于 index.html 的路径
                    return './coolprop.wasm';
                }
                return scriptDirectory + path;
            }
        };
        // ===========================================================

        // 将配置对象传递给 Module 工厂函数
        const CP = await Module(moduleArgs);
        
        return CP;

    } catch (err) {
        console.error("CoolProp WASM 加载失败:", err);
        // 将错误抛出，由 main.js 捕获
        throw new Error(`CoolProp.js 或 CoolProp.wasm 加载失败。 (${err.message})`);
    }
}


// 2. 公共的流体信息更新函数
// (此部分与您原文件 v4.5 保持一致)

const fluidInfoData = {
    'R134a':        { gwp: 1430, odp: 0,    safety: 'A1' },
    'R245fa':       { gwp: 1030, odp: 0,    safety: 'B1' },
    'R1233zd(E)':   { gwp: 1,    odp: 0,    safety: 'A1' },
    'R1234ze(E)':   { gwp: '<1', odp: 0,    safety: 'A2L' },
    'R123':         { gwp: 77,   odp: 0.012, safety: 'B1' },
    'R22':          { gwp: 1810, odp: 0.034, safety: 'A1' },
    'R410A':        { gwp: 2088, odp: 0,    safety: 'A1' },
    'R32':          { gwp: 675,  odp: 0,    safety: 'A2L' },
    'R290':         { gwp: 3,    odp: 0,    safety: 'A3' },
    'R717':         { gwp: 0,    odp: 0,    safety: 'B2L' },
    'R515B':        { gwp: 293,  odp: 0,    safety: 'A1' },
    'R142b':        { gwp: 2310, odp: 0.043, safety: 'A2' },
    'R1336mzz(Z)':  { gwp: 2,    odp: 0,    safety: 'A1' },
    'R744':         { gwp: 1,    odp: 0,    safety: 'A1' },
    'R600a':        { gwp: 3,    odp: 0,    safety: 'A3' },
    'R152a':        { gwp: 124,  odp: 0,    safety: 'A2' },
    'R454B':        { gwp: 466,  odp: 0,    safety: 'A2L' },
    'R513A':        { gwp: 631,  odp: 0,    safety: 'A1' },
    
    'R236fa':       { gwp: 9810, odp: 0,    safety: 'A1' },
    'R23':          { gwp: 14800, odp: 0,   safety: 'A1' },
    'R1234yf':      { gwp: '<1', odp: 0,    safety: 'A2L' },
    'R1270':        { gwp: 2,    odp: 0,    safety: 'A3' },
    'R1150':        { gwp: 2,    odp: 0,    safety: 'A3' },
    
    'Air':          { gwp: 0,    odp: 0,    safety: 'A1' },
    'Nitrogen':     { gwp: 0,    odp: 0,    safety: 'A1' },
    'Helium':       { gwp: 0,    odp: 0,    safety: 'A1' },
    'Neon':         { gwp: 0,    odp: 0,    safety: 'A1' },
    'Argon':        { gwp: 0,    odp: 0,    safety: 'A1' },
    'Water':        { gwp: 0,    odp: 0,    safety: 'A1' },
    'Hydrogen':     { gwp: 0,    odp: 0,    safety: 'A3' },
    'Oxygen':       { gwp: 0,    odp: 0,    safety: 'A1 (Oxidizer)' },
    'Methane':      { gwp: 25,   odp: 0,    safety: 'A3' }, 

    'default':      { gwp: 'N/A', odp: 'N/A', safety: 'N/A' }
};

/**
 * 更新流体信息框
 * @param {HTMLSelectElement} selectElement - 下拉菜单元素
 * @param {HTMLPreElement} infoElement - <pre> 元素
 * @param {object} CP - CoolProp 实例
 */
export function updateFluidInfo(selectElement, infoElement, CP) {
    if (!CP) {
        infoElement.textContent = "--- 物性库尚未加载 ---";
        return;
    }
    
    const fluid = selectElement.value;
    const info = fluidInfoData[fluid] || fluidInfoData['default'];
    
    try {
        if (fluid === 'Water' && (selectElement.id === 'fluid_m3' || selectElement.id === 'fluid_m4')) {
            infoElement.innerHTML = `
<b>IAPWS-IF97 (Water)</b>
----------------------------------------
GWP: 0, ODP: 0, Safety: A1
MVR 模式固定使用水工质。
----------------------------------------
临界温度 (Tc): 647.096 K (373.946 °C)
临界压力 (Pc): 220.64 bar
标准沸点 (Tb): 373.124 K (99.974 °C)
            `.trim();
            return;
        }

        const Tcrit_K = CP.PropsSI('Tcrit', '', 0, '', 0, fluid);
        const Pcrit_Pa = CP.PropsSI('Pcrit', '', 0, '', 0, fluid);
        const Tboil_K = CP.PropsSI('T', 'P', 101325, 'Q', 0, fluid);
        
        infoElement.innerHTML = `
<b>${fluid} 关键参数:</b>
----------------------------------------
GWP (AR4/AR5): ${info.gwp}
ODP:           ${info.odp}
安全级别:      ${info.safety} (毒性[A/B] / 可燃性[1/2L/2/3])
----------------------------------------
临界温度 (Tc): ${Tcrit_K.toFixed(2)} K (${(Tcrit_K - 273.15).toFixed(2)} °C)
临界压力 (Pc): ${(Pcrit_Pa / 1e5).toFixed(2)} bar
标准沸点 (Tb): ${Tboil_K.toFixed(2)} K (${(Tboil_K - 273.15).toFixed(2)} °C)
        `.trim();
        
    } catch (err) {
        console.error(`Update Fluid Info Failed for ${fluid}:`, err);
        if (err.message.includes("sublimation") && fluid === 'R744') {
             const Tcrit_K = CP.PropsSI('Tcrit', '', 0, '', 0, fluid);
             const Pcrit_Pa = CP.PropsSI('Pcrit', '', 0, '', 0, fluid);
             
             infoElement.innerHTML = `
<b>${fluid} 关键参数:</b>
----------------------------------------
GWP (AR4/AR5): ${info.gwp}
ODP:           ${info.odp}
安全级别:      ${info.safety}
----------------------------------------
临界温度 (Tc): ${Tcrit_K.toFixed(2)} K (${(Tcrit_K - 273.15).toFixed(2)} °C)
临界压力 (Pc): ${(Pcrit_Pa / 1e5).toFixed(2)} bar
标准沸点 (Tb): N/A (Sublimes at 1 atm)
            `.trim();
        } else {
            infoElement.textContent = `--- 无法加载 ${fluid} 的物性。 ---\n${err.message}`;
        }
    }
}