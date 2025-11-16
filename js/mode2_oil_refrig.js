// =====================================================================
// mode2_oil_refrig.js: 模式一 (制冷热泵) 模块 - (v3.1 最终兼容性修复版)
// 版本: v3.1
// 职责: 1. (最终修复) 采用JS完全接管打印流程，绕过Safari的CSS渲染bug。
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';

// --- 模块内部变量 ---
let CP_INSTANCE = null;
let lastMode2ResultText = null;

// --- DOM 元素 ---
let calcButtonM2, resultsDivM2, calcFormM2, printButtonM2;
let fluidSelectM2, fluidInfoDivM2;
let allInputsM2;

// --- 按钮状态 ---
const btnText2 = "计算性能 (模式一)";
const btnTextStale2 = "重新计算 (模式一)";
const classesFresh2 = ['bg-green-600', 'hover:bg-green-700', 'text-white'];
const classesStale2 = ['bg-yellow-500', 'hover:bg-yellow-600', 'text-black'];

function setButtonStale2() {
    if (calcButtonM2 && calcButtonM2.textContent !== btnTextStale2) {
        calcButtonM2.textContent = btnTextStale2;
        calcButtonM2.classList.remove(...classesFresh2);
        calcButtonM2.classList.add(...classesStale2);
        printButtonM2.disabled = true;
        lastMode2ResultText = null;
    }
}

function setButtonFresh2() {
    if (calcButtonM2) {
        calcButtonM2.textContent = btnText2;
        calcButtonM2.classList.remove(...classesStale2);
        calcButtonM2.classList.add(...classesFresh2);
    }
}

/**
 * 主计算函数 (逻辑未变)
 */
function calculateMode2() {
    try {
        const fluid = document.getElementById('fluid_m2').value;
        const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
        const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value);
        const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
        const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
        const T_2a_est_C = parseFloat(document.getElementById('temp_discharge_actual_m2').value);
        const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
        const eta_v = parseFloat(document.getElementById('eta_v_m2').value);
        const eff_mode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
        const eta_s_input = parseFloat(document.getElementById('eta_s_m2').value);
        const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);

        if (T_2a_est_C <= Tc_C) throw new Error(`[逻辑错误] 预估排气温度 T2a (${T_2a_est_C}°C) 必须高于冷凝温度 Tc (${Tc_C}°C)。`);
        if (subcooling_K < 0) throw new Error(`[逻辑错误] 过冷度 (${subcooling_K} K) 必须为正数或0。`);
        if (isNaN(Te_C) || isNaN(eta_v) || isNaN(eta_s_input)) throw new Error("输入参数包含无效数字，请检查所有字段。");
        
        let V_th_m3_s, flow_input_source;
        if (flow_mode === 'rpm') {
            const rpm = parseFloat(document.getElementById('rpm_m2').value);
            const displacement_cm3 = parseFloat(document.getElementById('displacement_m2').value);
            if (isNaN(rpm) || isNaN(displacement_cm3)) throw new Error("转速或排量无效。");
            V_th_m3_s = rpm * (displacement_cm3 / 1e6) / 60.0;
            flow_input_source = `(RPM: ${rpm}, Disp: ${displacement_cm3} cm³)`;
        } else {
            const flow_m3h = parseFloat(document.getElementById('flow_m3h_m2').value);
            if (isNaN(flow_m3h)) throw new Error("理论体积流量无效。");
            V_th_m3_s = flow_m3h / 3600.0;
            flow_input_source = `(Flow: ${flow_m3h} m³/h)`;
        }

        const T_evap_K = Te_C + 273.15, T_cond_K = Tc_C + 273.15;
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid), Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);
        const T_1_K = T_evap_K + superheat_K;
        const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid), s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid), rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid), T_2s_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'S', s_1, fluid);
        const T_3_K = T_cond_K - subcooling_K;
        const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid), h_4 = h_3;

        const V_act_m3_s = V_th_m3_s * eta_v;
        const m_dot_act = V_act_m3_s * rho_1;
        const Ws_W = m_dot_act * (h_2s - h_1);
        let W_shaft_W, W_input_W, eta_s_shaft, eta_s_total, eff_mode_desc;
        if (eff_mode === 'shaft') {
            eta_s_shaft = eta_s_input; W_shaft_W = Ws_W / eta_s_shaft; W_input_W = W_shaft_W / motor_eff; eta_s_total = Ws_W / W_input_W;
            eff_mode_desc = `效率基准: 轴功率 (η_s = ${eta_s_shaft.toFixed(4)})`;
        } else {
            eta_s_total = eta_s_input; W_input_W = Ws_W / eta_s_total; W_shaft_W = W_input_W * motor_eff; eta_s_shaft = Ws_W / W_shaft_W;
            eff_mode_desc = `效率基准: 输入功率 (η_total = ${eta_s_total.toFixed(4)})`;
        }

        const h_2a_no_oil = h_1 + (W_shaft_W / m_dot_act);
        const T_2a_no_oil_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_no_oil, fluid);
        const T_2a_est_K = T_2a_est_C + 273.15;
        let h_2a_act, T_2a_act_K, Q_oil_W, oil_note = "";
        if (T_2a_no_oil_K < T_2a_est_K) {
            h_2a_act = h_2a_no_oil; T_2a_act_K = T_2a_no_oil_K; Q_oil_W = 0;
            oil_note = `\n  (备注: 计算排气温度(${(T_2a_act_K - 273.15).toFixed(2)}°C)低于预估值，油冷负荷为0)`;
        } else {
            h_2a_act = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', Pc_Pa, fluid); T_2a_act_K = T_2a_est_K;
            const Q_gas_heat_W = m_dot_act * (h_2a_act - h_1); Q_oil_W = W_shaft_W - Q_gas_heat_W;
        }
        
        const Q_evap_W = m_dot_act * (h_1 - h_4), Q_cond_W = m_dot_act * (h_2a_act - h_3), Q_total_heat_W = W_shaft_W + Q_evap_W;
        const COP_R = Q_evap_W / W_input_W, COP_H_cond = Q_cond_W / W_input_W, COP_H_total = Q_total_heat_W / W_input_W;
        
        let output = `
--- 压缩机规格 (估算) ---
工质: ${fluid}
理论输气量 (V_th): ${V_th_m3_s.toFixed(6)} m³/s (${(V_th_m3_s * 3600).toFixed(3)} m³/h)
  (来源: ${flow_input_source})
实际吸气量 (V_act): ${V_act_m3_s.toFixed(6)} m³/s (V_th * η_v)
估算质量流量 (m_dot): ${m_dot_act.toFixed(5)} kg/s (V_act * rho_1)

--- 热力学状态点 ---
蒸发 (Evap):   Te = ${Te_C.toFixed(2)} °C, Pe = ${(Pe_Pa / 1e5).toFixed(3)} bar
冷凝 (Cond):   Tc = ${Tc_C.toFixed(2)} °C, Pc = ${(Pc_Pa / 1e5).toFixed(3)} bar
1. 吸气 (Inlet):   T1 = ${(T_1_K - 273.15).toFixed(2)} °C, h1 = ${(h_1 / 1000).toFixed(2)} kJ/kg
2s. 等熵出口: T2s = ${(T_2s_K - 273.15).toFixed(2)} °C, h2s = ${(h_2s / 1000).toFixed(2)} kJ/kg
2a. 实际出口: T2a = ${(T_2a_act_K - 273.15).toFixed(2)} °C, h2a = ${(h_2a_act / 1000).toFixed(2)} kJ/kg
3. 节流阀前: T3 = ${(T_3_K - 273.15).toFixed(2)} °C, h3 = ${(h_3 / 1000).toFixed(2)} kJ/kg

--- 功率 (估算) ---
理论等熵功率 (Ws):   ${(Ws_W / 1000).toFixed(3)} kW
估算轴功率 (W_shaft): ${(W_shaft_W / 1000).toFixed(3)} kW
估算输入功率 (W_input): ${(W_input_W / 1000).toFixed(3)} kW

--- 效率 ---
${eff_mode_desc}
(反算) 等熵效率 (η_s, 轴): ${eta_s_shaft.toFixed(4)}
(反算) 总等熵效率 (η_total): ${eta_s_total.toFixed(4)}
(输入) 容积效率 (η_v): ${eta_v.toFixed(4)}
(输入) 电机效率 (η_motor): ${motor_eff.toFixed(4)}

========================================
           性能估算结果
========================================
制冷量 (Q_evap):     ${(Q_evap_W / 1000).toFixed(3)} kW

--- 热回收 (Heat Recovery) ---
冷凝器负荷 (Q_cond):   ${(Q_cond_W / 1000).toFixed(3)} kW
油冷负荷 (Q_oil_load): ${(Q_oil_W / 1000).toFixed(3)} kW${oil_note}
----------------------------------------
总排热量 (Q_total_heat): ${(Q_total_heat_W / 1000).toFixed(3)} kW

--- 性能系数 (COP) ---
COP (制冷, COP_R):       ${COP_R.toFixed(3)}
COP (制热, COP_H_cond):  ${COP_H_cond.toFixed(3)}
COP (总热回收, COP_H_total): ${COP_H_total.toFixed(3)}
`;
        resultsDivM2.textContent = output;
        lastMode2ResultText = output.trim();
        setButtonFresh2();
        printButtonM2.disabled = false;
    } catch (error) {
        resultsDivM2.textContent = `计算出错 (模式一): ${error.message}\n\n请检查输入参数是否在工质的有效范围内。`;
        console.error("Mode 2 Error:", error);
        lastMode2ResultText = null;
        printButtonM2.disabled = true;
    }
}

function printReportMode2() {
    if (!lastMode2ResultText) {
        alert("没有可打印的结果。请先进行计算。");
        return;
    }
    const inputs = {
        '工质': document.getElementById('fluid_m2').value, '蒸发饱和温度 (°C)': document.getElementById('temp_evap_m2').value,
        '冷凝饱和温度 (°C)': document.getElementById('temp_cond_m2').value, '有效过热度 (K)': document.getElementById('superheat_m2').value,
        '过冷度 (K)': document.getElementById('subcooling_m2').value, '预估实际排气温度 (°C)': document.getElementById('temp_discharge_actual_m2').value,
        '容积效率 (η_v)': document.getElementById('eta_v_m2').value,
    };
    const effMode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
    if (effMode === 'input') {
        inputs['总等熵效率 (η_total)'] = document.getElementById('eta_s_m2').value;
        inputs['电机效率'] = document.getElementById('motor_eff_m2').value;
    } else {
        inputs['等熵效率 (η_s)'] = document.getElementById('eta_s_m2').value;
    }
    const flowMode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
    if (flowMode === 'rpm') {
        inputs['压缩机转速 (RPM)'] = document.getElementById('rpm_m2').value;
        inputs['每转排量 (cm³/rev)'] = document.getElementById('displacement_m2').value;
    } else {
        inputs['理论体积流量 (m³/h)'] = document.getElementById('flow_m3h_m2').value;
    }
    callPrint(inputs, lastMode2ResultText, "模式一: 制冷热泵 (喷油估算) - 计算报告");
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

export function initMode2(CP) {
    CP_INSTANCE = CP;
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    resultsDivM2 = document.getElementById('results-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    
    if (calcFormM2) {
        allInputsM2 = calcFormM2.querySelectorAll('input, select');
        calcFormM2.addEventListener('submit', (e) => { e.preventDefault(); calculateMode2(); });
        allInputsM2.forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });
        fluidSelectM2.addEventListener('change', () => updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE));
        printButtonM2.addEventListener('click', printReportMode2);
    }
    console.log("模式一 (制冷热泵) v3.1 已初始化。");
}