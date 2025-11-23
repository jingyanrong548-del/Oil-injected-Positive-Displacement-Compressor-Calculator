// =====================================================================
// mode2_oil_refrig.js: 模式一 (制冷热泵) 模块 - (v3.1 能量平衡详解版)
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies } from './efficiency_models.js';

let CP_INSTANCE = null;
let lastMode2ResultText = null;
let calcButtonM2, resultsDivM2, calcFormM2, printButtonM2, fluidSelectM2, fluidInfoDivM2;
let allInputsM2, tempDischargeActualM2; 
let autoEffCheckboxM2, tempEvapM2, tempCondM2, etaVM2, etaSM2;

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

function updateAndDisplayEfficienciesM2() {
    if (!CP_INSTANCE || !autoEffCheckboxM2.checked) return;
    try {
        const fluid = fluidSelectM2.value;
        const Te_C = parseFloat(tempEvapM2.value);
        const Tc_C = parseFloat(tempCondM2.value);
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        const pressureRatio = Pc_Pa / Pe_Pa;
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        etaVM2.value = efficiencies.eta_v;
        etaSM2.value = efficiencies.eta_s;
    } catch (error) {
        console.warn("在更新经验效率时物性查询失败:", error.message);
    }
}

function calculateMode2() {
    try {
        const fluid = fluidSelectM2.value;
        const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
        const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value);
        const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
        const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
        const T_2a_est_C = parseFloat(tempDischargeActualM2.value);
        const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
        const eff_mode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
        const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);
        const eta_v = parseFloat(etaVM2.value);
        const eta_s_input = parseFloat(etaSM2.value);

        if (T_2a_est_C <= Tc_C) throw new Error(`[逻辑错误] 预估排气温度 T2a (${T_2a_est_C}°C) 必须高于冷凝温度 Tc (${Tc_C}°C)。`);
        if (subcooling_K < 0) throw new Error(`[逻辑错误] 过冷度 (${subcooling_K} K) 必须为正数或0。`);
        if (isNaN(Te_C) || isNaN(eta_v) || isNaN(eta_s_input)) throw new Error("输入参数包含无效数字，请检查所有字段。");
        
        let V_th_m3_s, flow_input_source = "";
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
        
        // 输入功率 COP (含电机损耗)
        const COP_R = Q_evap_W / W_input_W, COP_H_cond = Q_cond_W / W_input_W, COP_H_total = Q_total_heat_W / W_input_W;

        // [新增] 轴功率 COP (理论循环，不含电机损耗，满足 COP_H = COP_R + 1)
        const COP_R_shaft = Q_evap_W / W_shaft_W;
        const COP_H_shaft = Q_total_heat_W / W_shaft_W;
        
        let output = `
--- 压缩机规格 (估算) ---
工质: ${fluid}
进出口压力 (Pressures): Pin = ${(Pe_Pa / 1e5).toFixed(3)} bar (a), Pout = ${(Pc_Pa / 1e5).toFixed(3)} bar (a)
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
>> 能量平衡校验: Q_evap(${ (Q_evap_W/1000).toFixed(2) }) + W_shaft(${ (W_shaft_W/1000).toFixed(2) }) = ${ ((Q_evap_W+W_shaft_W)/1000).toFixed(3) } kW (等于总排热量)

--- 性能系数 (COP) ---
A. 基于【输入功率】(含电机损耗):
  COP (制冷):      ${COP_R.toFixed(3)}
  COP (总热回收):  ${COP_H_total.toFixed(3)}
  (关系: COP_H ≈ COP_R + 电机效率${motor_eff})

B. 基于【轴功率】(纯热力学):
  COP (制冷):      ${COP_R_shaft.toFixed(3)}
  COP (总热回收):  ${COP_H_shaft.toFixed(3)}
  (关系: COP_H = COP_R + 1.000)
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
        alert("请先计算结果再打印。");
        return;
    }

    const flowMode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
    let flowInfo = "";
    if (flowMode === 'rpm') {
        flowInfo = `转速: ${document.getElementById('rpm_m2').value} RPM, 排量: ${document.getElementById('displacement_m2').value} cm³/rev`;
    } else {
        flowInfo = `理论流量: ${document.getElementById('flow_m3h_m2').value} m³/h`;
    }

    const effMode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
    const effLabel = effMode === 'shaft' ? '等熵效率 (η_s, 轴)' : '总等熵效率 (η_total)';

    const inputs = [
        { label: "计算模式", value: "模式一: 制冷热泵" },
        { label: "工质", value: fluidSelectM2.value },
        { label: "流量输入", value: flowInfo },
        { label: "蒸发温度 (Te)", value: `${tempEvapM2.value} °C` },
        { label: "冷凝温度 (Tc)", value: `${tempCondM2.value} °C` },
        { label: "过热度", value: `${document.getElementById('superheat_m2').value} K` },
        { label: "过冷度", value: `${document.getElementById('subcooling_m2').value} K` },
        { label: "预估排气温度 (T2a)", value: `${tempDischargeActualM2.value} °C` },
        { label: effLabel, value: etaSM2.value },
        { label: "容积效率 (η_v)", value: etaVM2.value },
        { label: "电机效率", value: document.getElementById('motor_eff_m2').value }
    ];

    callPrint(inputs, lastMode2ResultText, "喷油容积式压缩机 - 计算报告 (制冷模式)");
}

function callPrint(inputs, resultText, modeTitle) {
    const container = document.getElementById('print-container');
    if (!container) {
        console.error("Print container not found!");
        return;
    }
    const h1 = container.querySelector('h1');
    if(h1) h1.textContent = modeTitle;
    const table = container.querySelector('.print-table');
    if (table) {
        table.innerHTML = inputs.map(item => 
            `<tr><th>${item.label}</th><td>${item.value}</td></tr>`
        ).join('');
    }
    const pre = container.querySelector('.print-results');
    if(pre) pre.textContent = resultText;
    const footerP = container.querySelector('p:last-child');
    if(footerP) footerP.textContent = `生成时间: ${new Date().toLocaleString()}`;
    window.print();
}

export function triggerMode2EfficiencyUpdate() {
    if (autoEffCheckboxM2 && autoEffCheckboxM2.checked) {
        updateAndDisplayEfficienciesM2();
    }
}

export function initMode2(CP) {
    CP_INSTANCE = CP;
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    resultsDivM2 = document.getElementById('results-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    tempDischargeActualM2 = document.getElementById('temp_discharge_actual_m2');
    autoEffCheckboxM2 = document.getElementById('auto-eff-m2');
    tempEvapM2 = document.getElementById('temp_evap_m2');
    tempCondM2 = document.getElementById('temp_cond_m2');
    etaVM2 = document.getElementById('eta_v_m2');
    etaSM2 = document.getElementById('eta_s_m2');
    
    if (calcFormM2) {
        allInputsM2 = calcFormM2.querySelectorAll('input, select');
        calcFormM2.addEventListener('submit', (e) => { e.preventDefault(); calculateMode2(); });
        allInputsM2.forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });
        fluidSelectM2.addEventListener('change', () => {
            updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE);
        });
        const conditionInputs = [tempEvapM2, tempCondM2, autoEffCheckboxM2];
        conditionInputs.forEach(input => {
            input.addEventListener('change', updateAndDisplayEfficienciesM2);
        });
        if (printButtonM2) {
            printButtonM2.addEventListener('click', printReportMode2);
        }
    }
    console.log("模式一 (制冷热泵) v3.1 已初始化 (含能量平衡详解)。");
}