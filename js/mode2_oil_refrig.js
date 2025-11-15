// =====================================================================
// mode2_oil_refrig.js: 模式一 (制冷热泵) 模块 - (逻辑增强版 v2.3)
// 版本: v2.3
// 职责: 1. 初始化UI事件
//        2. 执行估算计算 (基于 η_s, η_v 和 T_2a)
//        3. 新增智能油冷判断逻辑
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';

// --- 模块内部变量 ---
let CP_INSTANCE = null;
let lastMode2ResultText = null;

// --- DOM 元素 ---
let calcButtonM2, resultsDivM2, calcFormM2, printButtonM2;
let fluidSelectM2, fluidInfoDivM2;
let allInputsM2;
let tempDischargeActualM2; 

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
 * 主计算函数 (逻辑增强版 v2.3)
 */
function calculateMode2() {
    try {
        // --- A. 获取所有输入值 ---
        const fluid = fluidSelectM2.value;
        const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
        const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value);
        const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
        const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
        const T_2a_est_C = parseFloat(tempDischargeActualM2.value);
        const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
        const eta_v = parseFloat(document.getElementById('eta_v_m2').value);
        const eff_mode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
        const eta_s_input = parseFloat(document.getElementById('eta_s_m2').value);
        const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);

        // --- B. 输入校验 ---
        if (T_2a_est_C <= Tc_C) {
            throw new Error(`[逻辑错误] 预估排气温度 T2a (${T_2a_est_C}°C) 必须高于冷凝温度 Tc (${Tc_C}°C)。`);
        }
        if (subcooling_K < 0) {
            throw new Error(`[逻辑错误] 过冷度 (${subcooling_K} K) 必须为正数或0。`);
        }
        if (isNaN(Te_C) || isNaN(eta_v) || isNaN(eta_s_input)) {
             throw new Error("输入参数包含无效数字，请检查所有字段。");
        }
        
        // --- C. 计算理论输气量 (V_th_m3_s) ---
        let V_th_m3_s;
        let flow_input_source = "";
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

        // --- D. 计算热力学状态点 ---
        const T_evap_K = Te_C + 273.15;
        const T_cond_K = Tc_C + 273.15;
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);
        const T_1_K = T_evap_K + superheat_K;
        const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
        const T_2s_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'S', s_1, fluid);
        const T_3_K = T_cond_K - subcooling_K;
        const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid);
        const h_4 = h_3;

        // --- E. 估算流量和功率 ---
        const V_act_m3_s = V_th_m3_s * eta_v;
        const m_dot_act = V_act_m3_s * rho_1;
        const Ws_W = m_dot_act * (h_2s - h_1);
        let W_shaft_W, W_input_W, eta_s_shaft, eta_s_total, eff_mode_desc;
        if (eff_mode === 'shaft') {
            eta_s_shaft = eta_s_input; 
            W_shaft_W = Ws_W / eta_s_shaft;
            W_input_W = W_shaft_W / motor_eff;
            eta_s_total = Ws_W / W_input_W;
            eff_mode_desc = `效率基准: 轴功率 (η_s = ${eta_s_shaft.toFixed(4)})`;
        } else {
            eta_s_total = eta_s_input;
            W_input_W = Ws_W / eta_s_total;
            W_shaft_W = W_input_W * motor_eff;
            eta_s_shaft = Ws_W / W_shaft_W;
            eff_mode_desc = `效率基准: 输入功率 (η_total = ${eta_s_total.toFixed(4)})`;
        }

        // --- F. (v2.3) 智能油冷逻辑判断 ---
        const h_2a_no_oil = h_1 + (W_shaft_W / m_dot_act);
        const T_2a_no_oil_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_no_oil, fluid);
        const T_2a_est_K = T_2a_est_C + 273.15;
        
        let h_2a_act, T_2a_act_K, Q_oil_W;
        let oil_note = "";

        if (T_2a_no_oil_K < T_2a_est_K) {
            // 物理上不可能达到预估温度，因为无油冷时温度已经更低
            h_2a_act = h_2a_no_oil;
            T_2a_act_K = T_2a_no_oil_K;
            Q_oil_W = 0;
            oil_note = `\n  (备注: 计算排气温度(${(T_2a_act_K - 273.15).toFixed(2)}°C)低于预估值，油冷负荷为0)`;
        } else {
            // 油正在起冷却作用
            h_2a_act = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', Pc_Pa, fluid);
            T_2a_act_K = T_2a_est_K;
            const Q_gas_heat_W = m_dot_act * (h_2a_act - h_1);
            Q_oil_W = W_shaft_W - Q_gas_heat_W;
        }
        
        // --- G. 计算最终性能 ---
        const Q_evap_W = m_dot_act * (h_1 - h_4);
        const Q_cond_W = m_dot_act * (h_2a_act - h_3);
        const Q_total_heat_W = W_shaft_W + Q_evap_W; 
        const COP_R = Q_evap_W / W_input_W;
        const COP_H_cond = Q_cond_W / W_input_W;
        const COP_H_total = Q_total_heat_W / W_input_W;
        
        // --- H. 格式化输出 ---
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
        lastMode2ResultText = output;
        setButtonFresh2();
        printButtonM2.disabled = false;

    } catch (error) {
        resultsDivM2.textContent = `计算出错 (模式一): ${error.message}\n\n请检查输入参数是否在工质的有效范围内。`;
        console.error("Mode 2 Error:", error);
        lastMode2ResultText = null;
        printButtonM2.disabled = true;
    }
}

// 打印函数 (未修改，保持原样)
function printReportMode2() {
    if (!lastMode2ResultText) {
        alert("没有可打印的结果。");
        return;
    }
    // ...
}
function callPrint(inputs, resultText, modeTitle) {
    // ...
}

// =====================================================================
// 模块初始化 (由 main.js 调用)
// =====================================================================
export function initMode2(CP) {
    CP_INSTANCE = CP;
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    resultsDivM2 = document.getElementById('results-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    tempDischargeActualM2 = document.getElementById('temp_discharge_actual_m2');
    
    if (calcFormM2) {
        allInputsM2 = calcFormM2.querySelectorAll('input, select');
        calcFormM2.addEventListener('submit', (event) => {
            event.preventDefault();
            calculateMode2();
        });
        allInputsM2.forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });
        if (fluidSelectM2) {
            fluidSelectM2.addEventListener('change', () => {
                updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE);
            });
        }
        if (printButtonM2) {
            // printButtonM2.addEventListener('click', printReportMode2); // 保持此功能
        }
    }
    console.log("模式一 (制冷热泵) v2.3 已初始化。");
}