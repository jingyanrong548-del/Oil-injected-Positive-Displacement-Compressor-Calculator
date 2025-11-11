// =====================================================================
// mode3_oil_gas.js: 模式三 (气体压缩) 模块 - (喷油版 v1.0)
// 版本: v1.0
// 职责: 1. 初始化模式三的 UI 事件
//        2. 执行模式三 (预测) 的计算 (基于等温效率 η_iso)
//        3. 处理打印
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';

// --- 模块内部变量 ---
let CP_INSTANCE = null;
let lastMode3ResultText = null;

// --- DOM 元素 ---
let calcButtonM3, resultsDivM3, calcFormM3, printButtonM3;
let fluidSelectM3, fluidInfoDivM3;
let allInputsM3;
let enableCoolerCalcM3, targetTempM3;

// =====================================================================
// 模式三 (气体压缩) 专用函数
// =====================================================================

// --- 按钮状态 (M3) ---
const btnText3 = "计算性能 (模式三)";
const btnTextStale3 = "重新计算 (模式三)";
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
 * 模式三 (气体压缩) 主计算函数 (喷油版 v1.0)
 */
function calculateMode3() {
    try {
        // --- A. 获取所有输入值 ---
        const fluid = fluidSelectM3.value;
        
        // 工况
        const Pe_bar = parseFloat(document.getElementById('press_in_m3').value);
        const Te_C = parseFloat(document.getElementById('temp_in_m3').value);
        const Pc_bar = parseFloat(document.getElementById('press_out_m3').value);
        
        // 压缩机
        const flow_mode = document.querySelector('input[name="flow_mode_m3"]:checked').value;
        const eta_v = parseFloat(document.getElementById('eta_v_m3').value);
        
        // (v1.0 喷油版) 效率 (基于等温)
        const eff_mode = document.querySelector('input[name="eff_mode_m3"]:checked').value; // 'shaft' 或 'input'
        const eta_iso_input = parseFloat(document.getElementById('eta_iso_m3').value); // η_iso 或 η_iso_total
        const motor_eff = parseFloat(document.getElementById('motor_eff_m3').value);
        
        // 校验 (基础)
        if (isNaN(Pe_bar) || isNaN(Pc_bar) || isNaN(Te_C) || Pe_bar <= 0 || Pc_bar <= 0) {
            throw new Error("压力或温度参数包含无效数字。");
        }
        if (Pc_bar <= Pe_bar) {
            throw new Error("排气压力必须高于吸气压力。");
        }
        if (isNaN(eta_v) || isNaN(eta_iso_input) || eta_v <= 0 || eta_iso_input <= 0) {
            throw new Error("效率参数必须是大于零的数字。");
        }
        if (eff_mode === 'input' && (isNaN(motor_eff) || motor_eff <= 0)) {
            throw new Error("当基于输入功率计算时，电机效率必须是大于零的数字。");
        }

        // --- B. 计算理论输气量 (V_th_m3_s) ---
        let V_th_m3_s;
        let flow_input_source = "";
        
        if (flow_mode === 'rpm') {
            const rpm = parseFloat(document.getElementById('rpm_m3').value);
            const displacement_cm3 = parseFloat(document.getElementById('displacement_m3').value);
            if (isNaN(rpm) || isNaN(displacement_cm3) || rpm <= 0 || displacement_cm3 <= 0) {
                throw new Error("转速或排量必须是大于零的数字。");
            }
            V_th_m3_s = rpm * (displacement_cm3 / 1e6) / 60.0;
            flow_input_source = `(RPM: ${rpm}, Disp: ${displacement_cm3} cm³)`;
        } else { // 'vol'
            const flow_m3h = parseFloat(document.getElementById('flow_m3h_m3').value);
            if (isNaN(flow_m3h) || flow_m3h <= 0) {
                throw new Error("理论体积流量必须是大于零的数字。");
            }
            V_th_m3_s = flow_m3h / 3600.0;
            flow_input_source = `(Flow: ${flow_m3h} m³/h)`;
        }

        // --- C. 计算热力学状态点 ---
        const Pe_Pa = Pe_bar * 1e5;
        const Pc_Pa = Pc_bar * 1e5;
        const T_1_K = Te_C + 273.15;

        // 状态 1 (吸气口)
        const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
        // const s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid); // (v1.0) 不再需要 s_1
        const rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid); // 吸气密度

        // (v1.0 喷油版) 移除 状态 2s (等熵出口)
        
        // --- D. 计算流量 (m_dot_act) ---
        const V_act_m3_s = V_th_m3_s * eta_v;
        const m_dot_act = V_act_m3_s * rho_1;

        // --- E. (v1.0 喷油版) 基于等温效率计算功率 ---
        
        // E.1: 计算理论等温功率 (W_iso_W)
        let W_iso_W;
        try {
            // R_specific = R_universal / MolarMass
            const R_gas = CP_INSTANCE.PropsSI('GAS_CONSTANT', '', 0, '', 0, fluid) / CP_INSTANCE.PropsSI('MOLAR_MASS', '', 0, '', 0, fluid);
            
            // W_iso = m_dot * R_specific * T1 * ln(P2/P1)
            W_iso_W = m_dot_act * R_gas * T_1_K * Math.log(Pc_Pa / Pe_Pa);

        } catch (isoErr) {
            console.warn("Isothermal power calculation failed: ", isoErr);
            throw new Error(`理论等温功率计算失败: ${isoErr.message} (工质 ${fluid} 可能不支持)`);
        }

        // E.2: 计算 W_shaft 和 W_input
        let W_shaft_W, W_input_W;
        let eta_iso_shaft, eta_iso_total;
        let eff_mode_desc = "";

        if (eff_mode === 'shaft') {
            eta_iso_shaft = eta_iso_input; // 输入的是 η_iso (轴)
            W_shaft_W = W_iso_W / eta_iso_shaft;
            
            if (isNaN(motor_eff) || motor_eff <= 0) {
                 throw new Error("电机效率必须是大于零的数字。");
            }
            W_input_W = W_shaft_W / motor_eff;
            eta_iso_total = W_iso_W / W_input_W; // 反算 η_iso_total
            
            eff_mode_desc = `效率基准: 轴功率 (η_iso = ${eta_iso_shaft.toFixed(4)})`;

        } else { // 'input'
            eta_iso_total = eta_iso_input; // 输入的是 η_iso_total (总)
            W_input_W = W_iso_W / eta_iso_total;
            
            if (isNaN(motor_eff) || motor_eff <= 0) {
                 throw new Error("当基于输入功率计算时，电机效率必须是大于零的数字。");
            }
            W_shaft_W = W_input_W * motor_eff;
            eta_iso_shaft = W_iso_W / W_shaft_W; // 反算 η_iso_shaft
            
            eff_mode_desc = `效率基准: 输入功率 (η_iso_total = ${eta_iso_total.toFixed(4)})`;
        }


        // --- F. 计算理论排气温度 (T2a) 和排热量 ---
        // (v1.0 喷油版) 注意: T2a 是基于绝热假设计算的
        const h_2a = h_1 + (W_shaft_W / m_dot_act);
        const T_2a_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a, fluid);
        
        const Q_discharge_W = m_dot_act * (h_2a - h_1); // 压缩总排热
        

        // --- G. 可选: 计算后冷却器 ---
        let cooler_output = "";
        if (enableCoolerCalcM3.checked) {
            const target_temp_C = parseFloat(targetTempM3.value);
            if (isNaN(target_temp_C)) {
                cooler_output = "\n--- 后冷却器 (Aftercooler) ---\n错误: 目标冷却后温度无效。";
            } else {
                const target_temp_K = target_temp_C + 273.15;
                if (target_temp_K >= T_2a_K) {
                    cooler_output = `\n--- 后冷却器 (Aftercooler) ---\n错误: 目标温度 (${target_temp_C.toFixed(2)} °C) 必须低于理论气体排温 (${(T_2a_K - 273.15).toFixed(2)} °C)。`;
                } else {
                    const h_cooler_out = CP_INSTANCE.PropsSI('H', 'T', target_temp_K, 'P', Pc_Pa, fluid);
                    const Q_cooler_W = m_dot_act * (h_2a - h_cooler_out);
                    
                    cooler_output = `\n--- 后冷却器 (Aftercooler) ---
后冷器负荷 (Q_cooler):   ${(Q_cooler_W / 1000).toFixed(3)} kW
  (备注: T_2a_th ${(T_2a_K - 273.15).toFixed(2)} °C -> T_target ${target_temp_C.toFixed(2)} °C)`;
                }
            }
        }

        // --- H. 格式化输出 (v1.0 喷油版) ---
        let output = `
--- 压缩机规格 ---
工质: ${fluid}
理论输气量 (V_th): ${V_th_m3_s.toFixed(6)} m³/s (${(V_th_m3_s * 3600).toFixed(3)} m³/h)
  (来源: ${flow_input_source})
实际吸气量 (V_act): ${V_act_m3_s.toFixed(6)} m³/s (V_th * η_v)
实际质量流量 (m_dot): ${m_dot_act.toFixed(5)} kg/s

--- 热力学状态点 ---
1. 吸气 (Inlet):   T1 = ${Te_C.toFixed(2)} °C, P1 = ${Pe_bar.toFixed(3)} bar
2a. 理论气体出口: T2a = ${(T_2a_K - 273.15).toFixed(2)} °C, P2 = ${Pc_bar.toFixed(3)} bar
(h1: ${(h_1 / 1000).toFixed(2)} kJ/kg, h2a_th: ${(h_2a / 1000).toFixed(2)} kJ/kg)

--- 功率 (Power) ---
理论等温功率 (W_iso):   ${(W_iso_W / 1000).toFixed(3)} kW
实际轴功率 (W_shaft): ${(W_shaft_W / 1000).toFixed(3)} kW
电机输入功率 (W_input): ${(W_input_W / 1000).toFixed(3)} kW

--- 效率 (Efficiency) ---
${eff_mode_desc}
(反算) 等温效率 (η_iso, 轴): ${eta_iso_shaft.toFixed(4)}  (W_iso / W_shaft)
(反算) 总等温效率 (η_iso_total): ${eta_iso_total.toFixed(4)}  (W_iso / W_input)
容积效率 (η_v): ${eta_v.toFixed(4)}
电机效率 (η_motor): ${eff_mode === 'shaft' ? motor_eff.toFixed(4) + ' (输入值)' : (motor_eff.toFixed(4))}

========================================
           性能预测结果
========================================
[!] 重要提示:
    由于喷油冷却效应，压缩机【实际排气温度】
    将会【远低于】上方计算的“理论气体出口 T2a”。
    (T2a 假设了轴功全部转化为气体热量)

总排热量 (Q_discharge): ${(Q_discharge_W / 1000).toFixed(3)} kW
  (备注: Q_discharge = m_dot * (h2a_th - h1))
${cooler_output}
`;

        resultsDivM3.textContent = output;
        lastMode3ResultText = output;
        setButtonFresh3();
        printButtonM3.disabled = false;

    } catch (error) {
        resultsDivM3.textContent = `计算出错 (M3): ${error.message}\n\n请检查输入参数是否在工质的有效范围内。`;
        console.error("Mode 3 Error:", error);
        lastMode3ResultText = null;
        printButtonM3.disabled = true;
    }
}

/**
 * (v1.0 喷油版) 模式三 (气体压缩) 打印报告
 */
function printReportMode3() {
    if (!lastMode3ResultText) {
        alert("没有可打印的结果 (M3)。");
        return;
    }
    
    const inputs = {
        "报告类型": `模式三: 性能预测 (气体压缩 - 喷油版)`,
        "工质": document.getElementById('fluid_m3').value,
        "理论输气量模式": document.querySelector('input[name="flow_mode_m3"]:checked').value === 'rpm' ? '按转速与排量' : '按体积流量',
        "转速 (RPM)": document.getElementById('rpm_m3').value,
        "排量 (cm³/rev)": document.getElementById('displacement_m3').value,
        "理论体积流量 (m³/h)": document.getElementById('flow_m3h_m3').value,
        "吸气压力 (bar)": document.getElementById('press_in_m3').value,
        "吸气温度 (°C)": document.getElementById('temp_in_m3').value,
        "排气压力 (bar)": document.getElementById('press_out_m3').value,
        "效率基准": document.querySelector('input[name="eff_mode_m3"]:checked').value === 'shaft' ? '基于轴功率 (η_iso)' : '基于输入功率 (η_iso_total)',
        "等温/总等温效率": document.getElementById('eta_iso_m3').value,
        "容积效率 (η_v)": document.getElementById('eta_v_m3').value,
        "电机效率": document.getElementById('motor_eff_m3').value,
        "计算后冷却器": document.getElementById('enable_cooler_calc_m3').checked ? '是' : '否',
        "目标冷却后温度 (°C)": document.getElementById('target_temp_m3').value,
    };
    
    callPrint(inputs, lastMode3ResultText, "模式三");
}

// =====================================================================
// 通用函数 (打印)
// =====================================================================

/**
 * 打印报告的核心函数
 * @param {object} inputs - 输入参数的对象
 * @param {string} resultText - 结果 <pre> 文本
 * @param {string} modeTitle - 模式标题 (e.g., "模式三")
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
 * (v1.0 喷油版) 模式三：初始化函数
 * @param {object} CP - CoolProp 实例
 */
export function initMode3(CP) {
    CP_INSTANCE = CP; // 将 CP 实例存储在模块作用域
    
    // --- 初始化 模式三 (气体压缩) ---
    calcButtonM3 = document.getElementById('calc-button-mode-3');
    resultsDivM3 = document.getElementById('results-mode-3');
    calcFormM3 = document.getElementById('calc-form-mode-3');
    printButtonM3 = document.getElementById('print-button-mode-3');
    fluidSelectM3 = document.getElementById('fluid_m3');
    fluidInfoDivM3 = document.getElementById('fluid-info-m3');
    enableCoolerCalcM3 = document.getElementById('enable_cooler_calc_m3');
    targetTempM3 = document.getElementById('target_temp_m3');

    if (calcFormM3) {
        allInputsM3 = calcFormM3.querySelectorAll('input, select');
        
        // 绑定计算事件 (M3)
        calcFormM3.addEventListener('submit', (event) => {
            event.preventDefault();
            calculateMode3();
        });

        // 绑定“脏”状态检查 (M3)
        allInputsM3.forEach(input => {
            input.addEventListener('input', setButtonStale3);
            input.addEventListener('change', setButtonStale3);
        });
        
        if (calcButtonM3) {
            calcButtonM3.addEventListener('stale', setButtonStale3);
        }

        // 绑定流体信息更新 (M3)
        if (fluidSelectM3) {
            fluidSelectM3.addEventListener('change', () => {
                updateFluidInfo(fluidSelectM3, fluidInfoDivM3, CP_INSTANCE);
            });
        }

        // 绑定打印按钮 (M3)
        if (printButtonM3) {
            printButtonM3.addEventListener('click', printReportMode3);
        }
    }
    
    console.log("模式三 (喷油气体 v1.0) 已初始化。");
}