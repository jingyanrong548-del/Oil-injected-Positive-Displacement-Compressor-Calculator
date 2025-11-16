// =====================================================================
// mode3_oil_gas.js: 模式二 (气体压缩) 模块 - (v3.1 最终兼容性修复版)
// 版本: v3.1
// 职责: 1. (最终修复) 采用JS完全接管打印流程，绕过Safari的CSS渲染bug。
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';

// --- 模块内部变量 ---
let CP_INSTANCE = null;
let lastMode3ResultText = null;

// --- DOM 元素 ---
let calcButtonM3, resultsDivM3, calcFormM3, printButtonM3;
let fluidSelectM3, fluidInfoDivM3;
let allInputsM3;

// --- 按钮状态 ---
const btnText3 = "计算性能 (模式二)";
const btnTextStale3 = "重新计算 (模式二)";
const classesFresh3 = ['bg-indigo-600', 'hover:bg-indigo-700', 'text-white'];
const classesStale3 = ['bg-yellow-500', 'hover:bg-yellow-600', 'text-black'];

function setButtonStale3() {
    if (calcButtonM3 && calcButtonM3.textContent !== btnTextStale3) {
        calcButtonM3.textContent = btnTextStale3;
        calcButtonM3.classList.remove(...classesFresh3);
        calcButtonM3.classList.add(...classesStale3);
        printButtonM3.disabled = true;
        lastMode3ResultText = null;
    }
}

function setButtonFresh3() {
    if (calcButtonM3) {
        calcButtonM3.textContent = btnText3;
        calcButtonM3.classList.remove(...classesStale3);
        calcButtonM3.classList.add(...classesFresh3);
    }
}

/**
 * 主计算函数 (逻辑未变)
 */
function calculateMode3() {
    try {
        const fluid = document.getElementById('fluid_m3').value;
        const Pe_bar = parseFloat(document.getElementById('press_in_m3').value);
        const Te_C = parseFloat(document.getElementById('temp_in_m3').value);
        const Pc_bar = parseFloat(document.getElementById('press_out_m3').value);
        const T_2a_actual_C = parseFloat(document.getElementById('temp_discharge_actual_m3').value);
        const flow_mode = document.querySelector('input[name="flow_mode_m3"]:checked').value;
        const eta_v = parseFloat(document.getElementById('eta_v_m3').value);
        const eff_mode = document.querySelector('input[name="eff_mode_m3"]:checked').value;
        const motor_eff = parseFloat(document.getElementById('motor_eff_m3').value);
        const efficiency_type = document.querySelector('input[name="eff_type_m3"]:checked').value;
        const eta_input = parseFloat(document.getElementById('eta_iso_m3').value);

        if (isNaN(Pe_bar) || isNaN(Pc_bar) || isNaN(Te_C) || isNaN(T_2a_actual_C) || isNaN(eta_v) || isNaN(eta_input)) throw new Error("输入参数包含无效数字，请检查所有字段。");
        if (Pc_bar <= Pe_bar) throw new Error("排气压力必须高于吸气压力。");
        if (T_2a_actual_C <= Te_C) throw new Error("预估排气温度必须高于吸气温度。");

        let V_th_m3_s;
        if (flow_mode === 'rpm') {
            const rpm = parseFloat(document.getElementById('rpm_m3').value);
            const displacement_cm3 = parseFloat(document.getElementById('displacement_m3').value);
            V_th_m3_s = rpm * (displacement_cm3 / 1e6) / 60.0;
        } else {
            const flow_m3h = parseFloat(document.getElementById('flow_m3h_m3').value);
            V_th_m3_s = flow_m3h / 3600.0;
        }

        const Pe_Pa = Pe_bar * 1e5, Pc_Pa = Pc_bar * 1e5, T_1_K = Te_C + 273.15;
        const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid), s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid), rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const V_act_m3_s = V_th_m3_s * eta_v;
        const m_dot_act = V_act_m3_s * rho_1;

        const R_gas = CP_INSTANCE.PropsSI('GAS_CONSTANT', '', 0, '', 0, fluid) / CP_INSTANCE.PropsSI('MOLAR_MASS', '', 0, '', 0, fluid);
        const W_iso_W = m_dot_act * R_gas * T_1_K * Math.log(Pc_Pa / Pe_Pa);
        const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
        const Ws_W = m_dot_act * (h_2s - h_1);
        
        let W_shaft_W, eta_iso_shaft, eta_s_shaft, eff_input_note_iso = "(反算)", eff_input_note_s = "(反算)";
        let input_shaft_efficiency = eta_input;
        if (eff_mode === 'input') input_shaft_efficiency = eta_input / motor_eff;

        if (efficiency_type === 'isothermal') {
            eta_iso_shaft = input_shaft_efficiency; W_shaft_W = W_iso_W / eta_iso_shaft; eta_s_shaft = Ws_W / W_shaft_W;
            eff_input_note_iso = "(输入)";
        } else {
            eta_s_shaft = input_shaft_efficiency; W_shaft_W = Ws_W / eta_s_shaft; eta_iso_shaft = W_iso_W / W_shaft_W;
            eff_input_note_s = "(输入)";
        }
        const W_input_W = W_shaft_W / motor_eff;
        const total_eta_iso = W_iso_W / W_input_W, total_eta_s = Ws_W / W_input_W;

        const T_2a_act_K = T_2a_actual_C + 273.15;
        const h_2a_act = CP_INSTANCE.PropsSI('H', 'T', T_2a_act_K, 'P', Pc_Pa, fluid);
        const Q_gas_heat_W = m_dot_act * (h_2a_act - h_1);
        const Q_oil_W = W_shaft_W - Q_gas_heat_W;
        if (Q_oil_W < 0) throw new Error(`计算油冷负荷为负(${ (Q_oil_W/1000).toFixed(2) } kW)。请检查效率或排温。`);

        let output = `
--- 压缩机规格 (估算) ---
工质: ${fluid}
实际吸气量 (V_act): ${V_act_m3_s.toFixed(6)} m³/s
估算质量流量 (m_dot): ${m_dot_act.toFixed(5)} kg/s

--- 热力学状态点 ---
1. 吸气 (Inlet):   T1=${Te_C.toFixed(2)}°C, P1=${Pe_bar.toFixed(3)}bar
2a. 实际出口: T2a=${T_2a_actual_C.toFixed(2)}°C, P2=${Pc_bar.toFixed(3)}bar

--- 功率 (估算) ---
理论等温功率 (W_iso):   ${(W_iso_W / 1000).toFixed(3)} kW
理论等熵功率 (Ws):     ${(Ws_W / 1000).toFixed(3)} kW
估算轴功率 (W_shaft):   ${(W_shaft_W / 1000).toFixed(3)} kW
估算输入功率 (W_input): ${(W_input_W / 1000).toFixed(3)} kW

--- 效率 ---
等温效率 (η_iso, 轴):   ${eta_iso_shaft.toFixed(4)} ${eff_input_note_iso}
等熵效率 (η_s, 轴):     ${eta_s_shaft.toFixed(4)} ${eff_input_note_s}
(总)等温效率 (η_iso_tot): ${total_eta_iso.toFixed(4)}
(总)等熵效率 (η_s_tot):   ${total_eta_s.toFixed(4)}
(输入) 容积效率 (η_v):   ${eta_v.toFixed(4)}
(输入) 电机效率 (η_motor): ${motor_eff.toFixed(4)}

========================================
           性能估算结果
========================================
--- 热量分配 (Heat Distribution) ---
气体吸收热量 (Q_gas): ${(Q_gas_heat_W / 1000).toFixed(3)} kW
  (备注: 由后冷却器带走)
油冷负荷 (Q_oil_load): ${(Q_oil_W / 1000).toFixed(3)} kW
  (备注: 由油冷却器带走)
----------------------------------------
总排热量 (Q_total_heat): ${(W_shaft_W / 1000).toFixed(3)} kW
  (备注: Q_total = W_shaft)
`;
        resultsDivM3.textContent = output;
        lastMode3ResultText = output.trim();
        setButtonFresh3();
        printButtonM3.disabled = false;
    } catch (error) {
        resultsDivM3.textContent = `计算出错 (模式二): ${error.message}\n\n请检查输入参数。`;
        console.error("Mode 3 Error:", error);
        lastMode3ResultText = null;
        printButtonM3.disabled = true;
    }
}

function printReportMode3() {
    if (!lastMode3ResultText) {
        alert("没有可打印的结果。请先进行计算。");
        return;
    }
    const inputs = {
        '工质': document.getElementById('fluid_m3').value, '吸气压力 (bar)': document.getElementById('press_in_m3').value,
        '吸气温度 (°C)': document.getElementById('temp_in_m3').value, '排气压力 (bar)': document.getElementById('press_out_m3').value,
        '预估实际排气温度 (°C)': document.getElementById('temp_discharge_actual_m3').value, '容积效率 (η_v)': document.getElementById('eta_v_m3').value,
    };
    const effType = document.querySelector('input[name="eff_type_m3"]:checked').value;
    if (effType === 'isothermal') {
        inputs['效率类型'] = '等温效率 (η_iso)'; inputs['等温效率值'] = document.getElementById('eta_iso_m3').value;
    } else {
        inputs['效率类型'] = '等熵效率 (η_s)'; inputs['等熵效率值'] = document.getElementById('eta_iso_m3').value;
    }
    const effMode = document.querySelector('input[name="eff_mode_m3"]:checked').value;
    inputs['功率基准'] = (effMode === 'input') ? '基于输入功率' : '基于轴功率';
    if (effMode === 'input') {
        inputs['电机效率'] = document.getElementById('motor_eff_m3').value;
    }
    const flowMode = document.querySelector('input[name="flow_mode_m3"]:checked').value;
    if (flowMode === 'rpm') {
        inputs['压缩机转速 (RPM)'] = document.getElementById('rpm_m3').value;
        inputs['每转排量 (cm³/rev)'] = document.getElementById('displacement_m3').value;
    } else {
        inputs['理论体积流量 (m³/h)'] = document.getElementById('flow_m3h_m3').value;
    }
    callPrint(inputs, lastMode3ResultText, "模式二: 气体压缩 (喷油估算) - 计算报告");
}

/**
 * [v3.1 最终兼容性修复] 采用JS完全接管打印流程
 */
function callPrint(inputs, resultText, modeTitle) {
    const printContainer = document.getElementById('print-container');
    if (!printContainer) {
        alert("打印功能初始化失败，请联系开发者。");
        return;
    }
    
    // 1. 填充好待打印的内容
    printContainer.querySelector('h1').textContent = modeTitle;
    let tableHtml = '';
    for (const key in inputs) {
        tableHtml += `<tr><th>${key}</th><td>${inputs[key]}</td></tr>`;
    }
    printContainer.querySelector('.print-table').innerHTML = tableHtml;
    printContainer.querySelector('.print-results').textContent = resultText;
    printContainer.querySelector('p').textContent = `报告生成时间: ${new Date().toLocaleString()} | 计算器版本: v2.3`;

    // 2. 存储原始页面内容
    const originalContent = document.body.innerHTML;

    // 3. 页面内容替换为打印内容
    document.body.innerHTML = printContainer.innerHTML;
    
    // 4. 定义一个恢复页面的函数
    const restorePage = () => {
        document.body.innerHTML = originalContent;
        // 恢复后需要重新获取DOM元素并绑定事件，因为innerHTML的替换会销毁它们
        // 这是最简单的恢复方式，但会导致页面需要重新加载才能再次计算。
        // 为了确保功能，我们强制重新加载。
        window.location.reload();
    };

    // 5. 调用打印
    window.print();
    
    // 6. 打印结束后，无论成功或取消，都恢复页面
    // 使用setTimeout确保恢复操作在打印对话框关闭后执行
    setTimeout(restorePage, 100);
}

export function initMode3(CP) {
    CP_INSTANCE = CP;
    calcButtonM3 = document.getElementById('calc-button-mode-3');
    resultsDivM3 = document.getElementById('results-mode-3');
    calcFormM3 = document.getElementById('calc-form-mode-3');
    printButtonM3 = document.getElementById('print-button-mode-3');
    fluidSelectM3 = document.getElementById('fluid_m3');
    fluidInfoDivM3 = document.getElementById('fluid-info-m3');

    if (calcFormM3) {
        allInputsM3 = calcFormM3.querySelectorAll('input, select');
        calcFormM3.addEventListener('submit', (e) => { e.preventDefault(); calculateMode3(); });
        allInputsM3.forEach(input => {
            input.addEventListener('input', setButtonStale3);
            input.addEventListener('change', setButtonStale3);
        });
        fluidSelectM3.addEventListener('change', () => updateFluidInfo(fluidSelectM3, fluidInfoDivM3, CP_INSTANCE));
        printButtonM3.addEventListener('click', printReportMode3);
    }
    console.log("模式二 (气体压缩) v3.1 已初始化。");
}