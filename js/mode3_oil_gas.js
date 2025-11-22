// =====================================================================
// mode3_oil_gas.js: 模式二 (气体压缩) 模块 - (v3.0 修复打印功能)
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies } from './efficiency_models.js';

let CP_INSTANCE = null;
let lastMode3ResultText = null;
let calcButtonM3, resultsDivM3, calcFormM3, printButtonM3, fluidSelectM3, fluidInfoDivM3;
let allInputsM3, tempDischargeActualM3;
let autoEffCheckboxM3, pressInM3, pressOutM3, etaVM3, etaIsoM3, effTypeRadiosM3;

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

function updateAndDisplayEfficienciesM3() {
    if (!autoEffCheckboxM3.checked) return;
    const Pe_bar = parseFloat(pressInM3.value);
    const Pc_bar = parseFloat(pressOutM3.value);
    if (isNaN(Pe_bar) || isNaN(Pc_bar) || Pc_bar <= Pe_bar) return;
    const pressureRatio = Pc_bar / Pe_bar;
    const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
    etaVM3.value = efficiencies.eta_v;
    const effType = document.querySelector('input[name="eff_type_m3"]:checked').value;
    if (effType === 'isothermal') {
        etaIsoM3.value = efficiencies.eta_iso;
    } else {
        etaIsoM3.value = efficiencies.eta_s;
    }
}

function calculateMode3() {
    try {
        const fluid = fluidSelectM3.value;
        const Pe_bar = parseFloat(document.getElementById('press_in_m3').value);
        const Te_C = parseFloat(document.getElementById('temp_in_m3').value);
        const Pc_bar = parseFloat(document.getElementById('press_out_m3').value);
        const T_2a_actual_C = parseFloat(tempDischargeActualM3.value);
        const flow_mode = document.querySelector('input[name="flow_mode_m3"]:checked').value;
        const eff_mode = document.querySelector('input[name="eff_mode_m3"]:checked').value; 
        const motor_eff = parseFloat(document.getElementById('motor_eff_m3').value);
        const efficiency_type = document.querySelector('input[name="eff_type_m3"]:checked').value;
        const eta_v = parseFloat(etaVM3.value);
        const eta_input = parseFloat(etaIsoM3.value);

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
        if (Q_oil_W < 0) throw new Error(`计算油冷负荷为负(${ (Q_oil_W/1000).toFixed(2) } kW)。请检查效率是否过低或预估排温是否过高。`);

        let output = `
--- 压缩机规格 (估算) ---
工质: ${fluid}
进出口压力 (Pressures): Pin = ${Pe_bar.toFixed(3)} bar (a), Pout = ${Pc_bar.toFixed(3)} bar (a)
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

// [新增] 实际的打印逻辑实现
function printReportMode3() {
    if (!lastMode3ResultText) {
        alert("请先计算结果再打印。");
        return;
    }

    const flowMode = document.querySelector('input[name="flow_mode_m3"]:checked').value;
    let flowInfo = "";
    if (flowMode === 'rpm') {
        flowInfo = `转速: ${document.getElementById('rpm_m3').value} RPM, 排量: ${document.getElementById('displacement_m3').value} cm³/rev`;
    } else {
        flowInfo = `理论流量: ${document.getElementById('flow_m3h_m3').value} m³/h`;
    }

    const effType = document.querySelector('input[name="eff_type_m3"]:checked').value;
    const effMode = document.querySelector('input[name="eff_mode_m3"]:checked').value;
    let effLabel = "";
    if (effType === 'isothermal') effLabel = "等温效率 (η_iso)";
    else effLabel = "等熵效率 (η_s)";
    if (effMode === 'input') effLabel = "总" + effLabel;

    const inputs = [
        { label: "计算模式", value: "模式二: 气体压缩" },
        { label: "工质", value: fluidSelectM3.value },
        { label: "流量输入", value: flowInfo },
        { label: "吸气压力 (Pin)", value: `${pressInM3.value} bar` },
        { label: "吸气温度 (Tin)", value: `${document.getElementById('temp_in_m3').value} °C` },
        { label: "排气压力 (Pout)", value: `${pressOutM3.value} bar` },
        { label: "预估排气温度 (T2a)", value: `${tempDischargeActualM3.value} °C` },
        { label: effLabel, value: etaIsoM3.value },
        { label: "容积效率 (η_v)", value: etaVM3.value }
    ];

    callPrint(inputs, lastMode3ResultText, "喷油容积式压缩机 - 计算报告 (气体模式)");
}

// [新增] 通用打印调用函数 (重复定义以确保模块独立性)
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

export function triggerMode3EfficiencyUpdate() {
    if (autoEffCheckboxM3 && autoEffCheckboxM3.checked) {
        updateAndDisplayEfficienciesM3();
    }
}

export function initMode3(CP) {
    CP_INSTANCE = CP;
    calcButtonM3 = document.getElementById('calc-button-mode-3');
    resultsDivM3 = document.getElementById('results-mode-3');
    calcFormM3 = document.getElementById('calc-form-mode-3');
    printButtonM3 = document.getElementById('print-button-mode-3');
    fluidSelectM3 = document.getElementById('fluid_m3');
    fluidInfoDivM3 = document.getElementById('fluid-info-m3');
    tempDischargeActualM3 = document.getElementById('temp_discharge_actual_m3');
    autoEffCheckboxM3 = document.getElementById('auto-eff-m3');
    pressInM3 = document.getElementById('press_in_m3');
    pressOutM3 = document.getElementById('press_out_m3');
    etaVM3 = document.getElementById('eta_v_m3');
    etaIsoM3 = document.getElementById('eta_iso_m3');
    effTypeRadiosM3 = document.querySelectorAll('input[name="eff_type_m3"]');

    if (calcFormM3) {
        allInputsM3 = calcFormM3.querySelectorAll('input, select');
        calcFormM3.addEventListener('submit', (e) => { e.preventDefault(); calculateMode3(); });
        allInputsM3.forEach(input => {
            input.addEventListener('input', setButtonStale3);
            input.addEventListener('change', setButtonStale3);
        });

        fluidSelectM3.addEventListener('change', () => {
            updateFluidInfo(fluidSelectM3, fluidInfoDivM3, CP_INSTANCE);
        });

        const conditionInputs = [pressInM3, pressOutM3, autoEffCheckboxM3];
        conditionInputs.forEach(input => {
            input.addEventListener('input', updateAndDisplayEfficienciesM3);
        });
        effTypeRadiosM3.forEach(radio => {
            radio.addEventListener('change', updateAndDisplayEfficienciesM3);
        });
        
        if (printButtonM3) {
            printButtonM3.addEventListener('click', printReportMode3);
        }
    }
    console.log("模式二 (气体压缩) v3.0 已初始化 (含打印修复)。");
}