// =====================================================================
// mode2_oil_refrig.js: 模式二 (制冷热泵) 模块 - (喷油预测版 v2.1)
// 版本: v2.1
// 职责: 1. 初始化模式二的 UI 事件
//        2. 执行模式二 (估算) 的计算 (基于 η_s, η_v 和 T_2a)
//        3. 添加输入校验 (T_2a > T_c, subcooling >= 0)
//        4. 处理打印
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

// =====================================================================
// 模式二 (制冷热泵) 专用函数
// =====================================================================

// --- 按钮状态 (M2) ---
const btnText2 = "计算性能 (模式二)";
const btnTextStale2 = "重新计算 (模式二)";
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
 * 模式二 (制冷热泵) 主计算函数 (喷油预测版 v2.1)
 */
function calculateMode2() {
    try {
        // --- A. 获取所有输入值 ---
        const fluid = fluidSelectM2.value;
        
        // 工况
        const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
        const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value); // v2.1: 标签已修正, 这是 T_c
        const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
        const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
        
        // v2.0: 喷油效果 (关键输入)
        const T_2a_actual_C = parseFloat(tempDischargeActualM2.value); // 这是 T_2a

        // 压缩机
        const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
        const eta_v = parseFloat(document.getElementById('eta_v_m2').value);
        
        // 效率
        const eff_mode = document.querySelector('input[name="eff_mode_m2"]:checked').value; // 'shaft' 或 'input'
        const eta_s_input = parseFloat(document.getElementById('eta_s_m2').value); // η_s 或 η_total
        const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);
        
        // --- (v2.1) 关键输入校验 ---
        if (isNaN(Tc_C) || isNaN(T_2a_actual_C)) {
            throw new Error("温度参数包含无效数字。");
        }
        if (T_2a_actual_C <= Tc_C) {
            throw new Error(
                `[物理逻辑错误]\n预估的实际排气温度 T2a (${T_2a_actual_C}°C) 必须 高于 冷凝饱和温度 Tc (${Tc_C}°C)，否则气体无法在冷凝器中放热。`
            );
        }
        if (subcooling_K < 0) {
            throw new Error(
                `[物理逻辑错误]\n过冷度 (${subcooling_K} K) 必须为正数或0。\n(您输入的-5 K 是无效的，会导致冷凝器出口温度高于冷凝温度)`
            );
        }
        // --- 校验结束 ---

        // 校验 (基础)
        if (isNaN(Te_C) || isNaN(superheat_K)) {
            throw new Error("热力学工况参数包含无效数字。");
        }
        if (isNaN(eta_v) || isNaN(eta_s_input) || eta_v <= 0 || eta_s_input <= 0) {
            throw new Error("效率参数必须是大于零的数字。");
        }
        if (eff_mode === 'input' && (isNaN(motor_eff) || motor_eff <= 0)) {
            throw new Error("当基于输入功率计算时，电机效率必须是大于零的数字。");
        }
        
        // --- B. 计算理论输气量 (V_th_m3_s) ---
        let V_th_m3_s;
        let flow_input_source = "";
        
        if (flow_mode === 'rpm') {
            const rpm = parseFloat(document.getElementById('rpm_m2').value);
            const displacement_cm3 = parseFloat(document.getElementById('displacement_m2').value);
            if (isNaN(rpm) || isNaN(displacement_cm3) || rpm <= 0 || displacement_cm3 <= 0) {
                throw new Error("转速或排量必须是大于零的数字。");
            }
            V_th_m3_s = rpm * (displacement_cm3 / 1e6) / 60.0;
            flow_input_source = `(RPM: ${rpm}, Disp: ${displacement_cm3} cm³)`;
        } else { // 'vol'
            const flow_m3h = parseFloat(document.getElementById('flow_m3h_m2').value);
            if (isNaN(flow_m3h) || flow_m3h <= 0) {
                throw new Error("理论体积流量必须是大于零的数字。");
            }
            V_th_m3_s = flow_m3h / 3600.0;
            flow_input_source = `(Flow: ${flow_m3h} m³/h)`;
        }

        // --- C. 计算热力学状态点 ---
        const T_evap_K = Te_C + 273.15;
        const T_cond_K = Tc_C + 273.15; // 高压由 Tc 决定
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

        if (Pc_Pa <= Pe_Pa) {
            throw new Error("冷凝压力必须高于蒸发压力。");
        }

        // 状态 1 (吸气口)
        const T_1_K = T_evap_K + superheat_K;
        const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid);
        const rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid);

        // 状态 2s (等熵出口)
        const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
        const T_2s_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'S', s_1, fluid);
        
        // 状态 3 (节流阀前)
        const T_3_K = T_cond_K - subcooling_K; // (v2.1 校验已确保 T_3 <= T_cond)
        const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid);
        
        // 状态 4 (蒸发器入口)
        const h_4 = h_3;

        // --- D. (v2.0) 估算流量 (m_dot_act) ---
        const V_act_m3_s = V_th_m3_s * eta_v;
        const m_dot_act = V_act_m3_s * rho_1;

        // --- E. (v2.0) 估算功率 (W_shaft_W, W_input_W) ---
        const Ws_W = m_dot_act * (h_2s - h_1); // 理论等熵功率
        
        let W_shaft_W, W_input_W;
        let eta_s_shaft, eta_s_total;
        let eff_mode_desc = "";

        if (eff_mode === 'shaft') {
            eta_s_shaft = eta_s_input; 
            W_shaft_W = Ws_W / eta_s_shaft;
            if (isNaN(motor_eff) || motor_eff <= 0) {
                 throw new Error("电机效率必须是大于零的数字。");
            }
            W_input_W = W_shaft_W / motor_eff;
            eta_s_total = Ws_W / W_input_W;
            eff_mode_desc = `效率基准: 轴功率 (η_s = ${eta_s_shaft.toFixed(4)})`;
        } else { // 'input'
            eta_s_total = eta_s_input;
            W_input_W = Ws_W / eta_s_total;
            if (isNaN(motor_eff) || motor_eff <= 0) {
                 throw new Error("当基于输入功率计算时，电机效率必须是大于零的数字。");
            }
            W_shaft_W = W_input_W * motor_eff;
            eta_s_shaft = Ws_W / W_shaft_W;
            eff_mode_desc = `效率基准: 输入功率 (η_total = ${eta_s_total.toFixed(4)})`;
        }

        // --- F. (v2.0) 计算实际出口 (State 2a) 和容量 ---
        const T_2a_act_K = T_2a_actual_C + 273.15; // 高温由 T_2a 决定
        // (v2.1 校验已确保 T_2a_act_K > T_cond_K)

        const h_2a_act = CP_INSTANCE.PropsSI('H', 'T', T_2a_act_K, 'P', Pc_Pa, fluid);
        
        const Q_evap_W = m_dot_act * (h_1 - h_4);
        const Q_cond_W = m_dot_act * (h_2a_act - h_3); 
        // (v2.1: 此时 h_2a_act > h_3, Q_cond 必为正)

        // --- G. (v2.0) 计算油冷负荷 (Q_oil_W) ---
        const Q_gas_heat_W = m_dot_act * (h_2a_act - h_1);
        const Q_oil_W = W_shaft_W - Q_gas_heat_W;

        if (Q_oil_W < 0) {
            throw new Error(`计算得到的油冷负荷为负数 (${(Q_oil_W/1000).toFixed(2)} kW)。\n这在物理上是不可能的。请检查您的效率 (η_s) 是否设置过低，或者 (T_2a) 是否设置过高。`);
        }

        // --- H. (v2.0) 计算总排热和 COP ---
        const Q_total_heat_W = W_shaft_W + Q_evap_W; 
        
        const COP_R = Q_evap_W / W_input_W;
        const COP_H_cond = Q_cond_W / W_input_W; // 仅冷凝器COP
        const COP_H_total = Q_total_heat_W / W_input_W; // 总热回收COP (冷凝器+油冷)

        // --- I. (v2.1) 格式化输出 ---
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
1. 吸气 (Inlet):   T1 = ${(T_1_K - 273.15).toFixed(2)} °C (过热 ${superheat_K} K), h1 = ${(h_1 / 1000).toFixed(2)} kJ/kg, s1 = ${(s_1 / 1000).toFixed(4)} kJ/kg·K
2s. 等熵出口: T2s = ${(T_2s_K - 273.15).toFixed(2)} °C, h2s = ${(h_2s / 1000).toFixed(2)} kJ/kg
2a. 实际出口: T2a = ${T_2a_actual_C.toFixed(2)} °C (输入值), h2a = ${(h_2a_act / 1000).toFixed(2)} kJ/kg
3. 节流阀前: T3 = ${(T_3_K - 273.15).toFixed(2)} °C (过冷 ${subcooling_K} K), h3 = ${(h_3 / 1000).toFixed(2)} kJ/kg
4. 蒸发器入口: h4 = ${(h_4 / 1000).toFixed(2)} kJ/kg

--- 功率 (估算) ---
理论等熵功率 (Ws):   ${(Ws_W / 1000).toFixed(3)} kW (m_dot * (h2s - h1))
估算轴功率 (W_shaft): ${(W_shaft_W / 1000).toFixed(3)} kW (Ws / η_s)
估算输入功率 (W_input): ${(W_input_W / 1000).toFixed(3)} kW (W_shaft / η_motor)

--- 效率 (输入) ---
${eff_mode_desc}
(反算) 等熵效率 (η_s, 轴): ${eta_s_shaft.toFixed(4)}
(反算) 总等熵效率 (η_total): ${eta_s_total.toFixed(4)}
容积效率 (η_v): ${eta_v.toFixed(4)}
电机效率 (η_motor): ${eff_mode === 'shaft' ? motor_eff.toFixed(4) + ' (输入值)' : (motor_eff.toFixed(4))}

========================================
           性能估算结果 (v2.1)
========================================
制冷量 (Q_evap):     ${(Q_evap_W / 1000).toFixed(3)} kW
  (备注: m_dot * (h1 - h4))

--- 热回收 (Heat Recovery) ---
冷凝器负荷 (Q_cond):   ${(Q_cond_W / 1000).toFixed(3)} kW
  (备注: m_dot * (h2a - h3))
油冷负荷 (Q_oil_load): ${(Q_oil_W / 1000).toFixed(3)} kW
  (备注: W_shaft - m_dot * (h2a - h1))
----------------------------------------
总排热量 (Q_total_heat): ${(Q_total_heat_W / 1000).toFixed(3)} kW
  (备注: Q_total_heat = Q_cond + Q_oil = W_shaft + Q_evap)

--- 性能系数 (COP) ---
COP (制冷, COP_R):       ${COP_R.toFixed(3)} (Q_evap / W_input)
COP (制热, COP_H_cond):  ${COP_H_cond.toFixed(3)} (Q_cond / W_input)
COP (总热回收, COP_H_total): ${COP_H_total.toFixed(3)} (Q_total_heat / W_input)
`;

        resultsDivM2.textContent = output;
        lastMode2ResultText = output;
        setButtonFresh2();
        printButtonM2.disabled = false;

    } catch (error) {
        resultsDivM2.textContent = `计算出错 (M2 v2.1): ${error.message}\n\n请检查输入参数是否在工质的有效范围内, 以及效率和T2a是否匹配。`;
        console.error("Mode 2 Error:", error);
        lastMode2ResultText = null;
        printButtonM2.disabled = true;
    }
}

/**
 * (v2.1 喷油预测版) 模式二 (制冷热泵) 打印报告
 */
function printReportMode2() {
    if (!lastMode2ResultText) {
        alert("没有可打印的结果 (M2)。");
        return;
    }

    const inputs = {
        "报告类型": `模式二: 性能估算 (制冷热泵 - 喷油版 v2.1)`,
        "工质": document.getElementById('fluid_m2').value,
        "理论输气量模式": document.querySelector('input[name="flow_mode_m2"]:checked').value === 'rpm' ? '按转速与排量' : '按体积流量',
        "转速 (RPM)": document.getElementById('rpm_m2').value,
        "排量 (cm³/rev)": document.getElementById('displacement_m2').value,
        "理论体积流量 (m³/h)": document.getElementById('flow_m3h_m2').value,
        "蒸发饱和温度 (T_e) (°C)": document.getElementById('temp_evap_m2').value,
        "冷凝饱和温度 (T_c) (°C)": document.getElementById('temp_cond_m2').value,
        "有效过热度 (K)": document.getElementById('superheat_m2').value,
        "过冷度 (K)": document.getElementById('subcooling_m2').value,
        "效率基准": document.querySelector('input[name="eff_mode_m2"]:checked').value === 'shaft' ? '基于轴功率 (η_s)' : '基于输入功率 (η_total)',
        "等熵/总效率 (η_s / η_total)": document.getElementById('eta_s_m2').value,
        "容积效率 (η_v)": document.getElementById('eta_v_m2').value,
        "电机效率": document.getElementById('motor_eff_m2').value,
        "预估的实际排气温度 T2a (°C)": document.getElementById('temp_discharge_actual_m2').value,
    };
    
    callPrint(inputs, lastMode2ResultText, "模式二");
}


// =====================================================================
// 通用函数 (打印)
// =====================================================================

/**
 * 打印报告的核心函数
 * @param {object} inputs - 输入参数的对象
 * @param {string} resultText - 结果 <pre> 文本
 * @param {string} modeTitle - 模式标题 (e.g., "模式二")
 */
function callPrint(inputs, resultText, modeTitle) {
    let printContainer = document.getElementById('print-container');
    if (printContainer) {
        printContainer.remove();
    }
    printContainer = document.createElement('div');
    printContainer.id = 'print-container';

    let printHtml = `
        <h1>压缩机性能计算报告</h1>
        <p>计算时间: ${new Date().toLocaleString('zh-CN')}</p>
        <h2>1. 输入参数 (${modeTitle})</h2>
        <table class="print-table">
            ${Object.entries(inputs).map(([key, value]) => `
                <tr>
                    <th>${key}</th>
                    <td>${value}</td>
                </tr>
            `).join('')}
        </table>
        <h2>2. 计算结果 (${modeTitle})</h2>
        <pre class="print-results">${resultText}</pre>
        <h3>--- 报告结束 (编者: 荆炎荣) ---</h3>
    `;

    printContainer.innerHTML = printHtml;
    document.body.appendChild(printContainer);
    window.print();
    setTimeout(() => {
        if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
        }
    }, 500);
}


// =====================================================================
// 模块初始化 (由 main.js 调用)
// =====================================================================

/**
 * (v2.1 喷油预测版) 模式二：初始化函数
 * @param {object} CP - CoolProp 实例
 */
export function initMode2(CP) {
    CP_INSTANCE = CP; // 将 CP 实例存储在模块作用域
    
    // --- 初始化 模式二 (制冷热泵) ---
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    resultsDivM2 = document.getElementById('results-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    // v2.0: 绑定新输入
    tempDischargeActualM2 = document.getElementById('temp_discharge_actual_m2');
    
    if (calcFormM2) {
        allInputsM2 = calcFormM2.querySelectorAll('input, select');
        
        // 绑定计算事件 (M2)
        calcFormM2.addEventListener('submit', (event) => {
            event.preventDefault();
            calculateMode2();
        });

        // 绑定“脏”状态检查 (M2)
        allInputsM2.forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });
        
        // 确保 M1 传输后, M2 按钮变脏
        if (calcButtonM2) {
            calcButtonM2.addEventListener('stale', setButtonStale2);
        }

        // 绑定流体信息更新 (M2)
        if (fluidSelectM2) {
            fluidSelectM2.addEventListener('change', () => {
                updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE);
            });
        }

        // 绑定打印按钮 (M2)
        if (printButtonM2) {
            printButtonM2.addEventListener('click', printReportMode2);
        }
    }
    
    console.log("模式二 (喷油制冷 v2.1) 已初始化。");
}