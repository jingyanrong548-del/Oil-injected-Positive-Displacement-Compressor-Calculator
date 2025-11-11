// =====================================================================
// mode1_oil_eval.js: 模式一 (性能评估) 模块 - (喷油版 v1.0)
// 版本: v1.0
// 职责: 1. 初始化模式一的 UI 事件
//        2. 执行模式一 (评估) 的计算 (核心: 反算 Q_oil 和 eta_v)
//        3. 处理打印和数据传输
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';

// --- 模块内部变量 ---
let CP_INSTANCE = null;
let lastMode1Results = null;
let lastMode1ResultText = null;

// --- DOM 元素引用 ---
let calcButtonM1, resultsDivM1, calcFormM1, transferButton, printButtonM1;
let fluidSelectM1, fluidInfoDivM1;
let allInputsM1;

// --- 按钮状态常量 ---
const btnText = "计算 (模式一)";
const btnTextStale = "重新计算 (模式一)";
const classesFresh = ['bg-blue-600', 'hover:bg-blue-700', 'text-white'];
const classesStale = ['bg-yellow-500', 'hover:bg-yellow-600', 'text-black'];

/**
 * 设置按钮为“脏”状态 (Stale)
 */
function setButtonStale() {
    calcButtonM1.textContent = btnTextStale;
    calcButtonM1.classList.remove(...classesFresh);
    calcButtonM1.classList.add(...classesStale);
    transferButton.disabled = true;
    printButtonM1.disabled = true;
    lastMode1Results = null;
    lastMode1ResultText = null;
}

/**
 * 设置按钮为“新”状态 (Fresh)
 */
function setButtonFresh() {
    calcButtonM1.textContent = btnText;
    calcButtonM1.classList.remove(...classesStale);
    calcButtonM1.classList.add(...classesFresh);
}


/**
 * 模式一：主计算函数 (喷油版 v1.0)
 */
function calculateMode1() {
    try {
        // --- A. 获取所有输入值 ---
        const fluid = fluidSelectM1.value;
        const flow_mode = document.querySelector('input[name="flow_mode"]:checked').value;
        const power_mode = document.querySelector('input[name="power_mode"]:checked').value;
        const capacity_mode = document.querySelector('input[name="capacity_mode"]:checked').value;
        
        let rpm_val = NaN;
        if (flow_mode === 'rpm') {
             rpm_val = parseFloat(document.getElementById('rpm').value);
        }

        const Q_input_kW = parseFloat(document.getElementById('capacity').value);
        const Win_box_kW = parseFloat(document.getElementById('power').value);
        const motor_eff_val = parseFloat(document.getElementById('motor_eff').value);
        const Te_C = parseFloat(document.getElementById('temp_evap').value);
        const Tc_C = parseFloat(document.getElementById('temp_cond').value);
        const dT_sh_K = parseFloat(document.getElementById('superheat').value);
        const dT_sc_K = parseFloat(document.getElementById('subcooling').value);
        
        // (v1.0 喷油版) 新增输入: 实际排气温度
        const T2a_actual_C = parseFloat(document.getElementById('temp_discharge_m1').value);

        if (isNaN(Q_input_kW) || isNaN(Win_box_kW) || isNaN(Te_C) || isNaN(Tc_C) || isNaN(dT_sh_K) || isNaN(dT_sc_K) || isNaN(T2a_actual_C)) {
            throw new Error("输入包含无效数字，请检查所有字段 (包括实际排气温度)。");
        }
        if (flow_mode === 'rpm' && isNaN(rpm_val)) {
             throw new Error("在'按转速'模式下，必须提供有效的转速。");
        }
        if (power_mode === 'input' && isNaN(motor_eff_val)) {
             throw new Error("在'输入功率'模式下，必须提供有效的电机效率。");
        }

        // --- B. 单位转换 ---
        const Te_K = Te_C + 273.15;
        const Tc_K = Tc_C + 273.15;
        const T2a_actual_K = T2a_actual_C + 273.15;
        const Q_input_W = Q_input_kW * 1000;
        const Win_box_W = Win_box_kW * 1000;

        // --- C. 功率和容量计算 ---
        let W_shaft_W;
        let Win_input_W;
        if (power_mode === 'shaft') {
            W_shaft_W = Win_box_W;
            Win_input_W = NaN;
        } else {
            Win_input_W = Win_box_W;
            W_shaft_W = Win_input_W * motor_eff_val;
        }
        let Qe_W;
        let Qh_W;
        if (capacity_mode === 'refrigeration') {
            Qe_W = Q_input_W;
            Qh_W = Qe_W + W_shaft_W;
        } else {
            Qh_W = Q_input_W;
            Qe_W = Qh_W - W_shaft_W;
        }
        if (Qe_W <= 0) {
            throw new Error(`计算的制冷量 (Qe = Qh - W_shaft) 小于等于零 (${(Qe_W/1000).toFixed(2)} kW)。请检查输入。`);
        }
        const W_shaft_kW = W_shaft_W / 1000; // 转换为 kW 供后续使用

        // --- D. 理论体积流量 (m³/s) ---
        let V_th_m3_s;
        let V_rev_cm3_val = NaN, V_th_m3_h_val = NaN;
        if (flow_mode === 'rpm') {
            V_rev_cm3_val = parseFloat(document.getElementById('displacement').value);
            if (isNaN(V_rev_cm3_val)) throw new Error("请检查每转排量输入。");
            if (rpm_val <= 0) throw new Error("转速必须大于 0。");
            V_th_m3_s = (V_rev_cm3_val / 1e6) * (rpm_val / 60);
            V_th_m3_h_val = V_th_m3_s * 3600;
        } else {
            V_th_m3_h_val = parseFloat(document.getElementById('flow_m3h').value);
            if (isNaN(V_th_m3_h_val)) throw new Error("请检查体积流量输入。");
            V_th_m3_s = V_th_m3_h_val / 3600;
        }
        if (V_th_m3_s <= 0) throw new Error("理论排量必须大于零。");

        // --- E. 计算稳定状态点 (1, 3, 4) ---
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_K, 'Q', 1, fluid);
        const T1_K = Te_K + dT_sh_K;
        const h1_J_kg = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', Pe_Pa, fluid);
        const rho1_kg_m3 = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', Pe_Pa, fluid);
        const v1_m3_kg = 1 / rho1_kg_m3;
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_K, 'Q', 0, fluid);
        const T3_K = Tc_K - dT_sc_K;
        const h3_J_kg = CP_INSTANCE.PropsSI('H', 'T', T3_K, 'P', Pc_Pa, fluid);
        const h4_J_kg = h3_J_kg;

        // --- F. 计算稳定的性能参数 (质量流, 容积效率) ---
        const h_evap_J_kg = h1_J_kg - h4_J_kg;
        if (h_evap_J_kg <= 0) throw new Error("计算出错：制冷焓差小于等于零。");
        const m_dot_kg_s = Qe_W / h_evap_J_kg;
        const V_actual_m3_s = m_dot_kg_s * v1_m3_kg;
        const eta_v = (V_actual_m3_s / V_th_m3_s);

        // --- G. (v1.0 喷油版) 计算喷油机的热量平衡 ---
        let h2a_actual_J_kg = NaN, Q_gas_kW = NaN, Q_oil_kW = NaN;
        let actual_temp_error_msg = null;
        try {
            if (m_dot_kg_s <= 0) throw new Error("质量流量为零，无法计算。");
            
            // G.1: 计算实际排气焓 (h2a)
            h2a_actual_J_kg = CP_INSTANCE.PropsSI('H', 'T', T2a_actual_K, 'P', Pc_Pa, fluid);
            
            // G.2: 计算气体焓升功率 (Q_gas)
            Q_gas_kW = m_dot_kg_s * (h2a_actual_J_kg - h1_J_kg) / 1000;

            // G.3: 计算油带走的热量 (Q_oil)
            // 能量平衡: W_shaft = Q_gas + Q_oil
            Q_oil_kW = W_shaft_kW - Q_gas_kW;

        } catch (actual_temp_error) {
            console.error("Actual temp/oil calc failed (Mode 1):", actual_temp_error);
            actual_temp_error_msg = `计算失败 (${actual_temp_error.message})`;
        }

        // --- H. 格式化输出 (v1.0 喷油版) ---
        const powerInputLabel = (power_mode === 'shaft') ? `轴功率 (Win)` : `输入功率 (Win)`;
        const capacityInputLabel = (capacity_mode === 'refrigeration') ? `制冷量 (Qe)` : `制热量 (Qh)`;

        let output = `
--- 计算概览 (工质: ${fluid}) ---
蒸发压力 (Pe): ${(Pe_Pa / 1e5).toFixed(3)} bar
冷凝压力 (Pc): ${(Pc_Pa / 1e5).toFixed(3)} bar
压缩比 (PR):   ${(Pc_Pa / Pe_Pa).toFixed(2)}

--- 关键状态点 ---
状态 1 (入口):
  T1 = ${T1_K.toFixed(2)} K (${(T1_K - 273.15).toFixed(2)} °C)
  h1 = ${(h1_J_kg / 1000).toFixed(2)} kJ/kg
  v1 = ${v1_m3_kg.toFixed(5)} m³/kg
状态 3 (阀前):
  T3 = ${T3_K.toFixed(2)} K (${(T3_K - 273.15).toFixed(2)} °C)
  h3 = ${(h3_J_kg / 1000).toFixed(2)} kJ/kg
状态 2a (实测出口):
  T2a = ${T2a_actual_C.toFixed(2)} °C (实测输入值)
  h2a = ${isNaN(h2a_actual_J_kg) ? `N/A (${actual_temp_error_msg})` : `${(h2a_actual_J_kg / 1000).toFixed(2)} kJ/kg`}

--- 功率与容量 (基于能量平衡) ---
输入 ${capacityInputLabel}: ${Q_input_kW.toFixed(3)} kW
输入 ${powerInputLabel}: ${Win_box_kW.toFixed(3)} kW
${(power_mode === 'input') ? `电机效率:       ${(motor_eff_val * 100).toFixed(1)} %` : ''}
计算轴功率:     ${W_shaft_kW.toFixed(3)} kW
计算 ${capacity_mode === 'refrigeration' ? '制热量 (Qh)' : '制冷量 (Qe)'}: ${capacity_mode === 'refrigeration' ? (Qh_W / 1000).toFixed(3) : (Qe_W / 1000).toFixed(3)} kW

--- 流量 ---
质量流量 (m_dot): ${m_dot_kg_s.toFixed(5)} kg/s
`;
        // v4.3 修复: 调整输出 (保留)
        let flow_output = '';
        if (flow_mode === 'rpm') {
            flow_output = `
--- 体积流量 (转速: ${rpm_val.toFixed(0)} RPM) ---
输入排量:     ${V_rev_cm3_val.toFixed(1)} cm³/rev
计算流量:     ${V_th_m3_h_val.toFixed(2)} m³/h
`;
        } else {
            flow_output = `
--- 体积流量 ---
输入流量:     ${V_th_m3_h_val.toFixed(2)} m³/h
`;
        }
        
        output += flow_output; // 添加条件块

        output += `
理论体积流量 (V_th): ${V_th_m3_s.toFixed(6)} m³/s
实际体积流量 (V_act): ${V_actual_m3_s.toFixed(6)} m³/s

========================================
           喷油机性能评估
========================================
容积效率 (η_v):         ${(eta_v * 100).toFixed(2)} %
  (备注: 实际吸气体积流量 / 理论输气量)

--- 喷油热平衡 (能量平衡法) ---
实际轴功率 (W_shaft):   ${W_shaft_kW.toFixed(3)} kW
气体焓升功率 (Q_gas):   ${isNaN(Q_gas_kW) ? 'N/A' : Q_gas_kW.toFixed(3)} kW
  (备注: m_dot * (h2a - h1))
油带走的热量 (Q_oil):   ${isNaN(Q_oil_kW) ? 'N/A' : Q_oil_kW.toFixed(3)} kW
  (备注: W_shaft - Q_gas)
`;

        resultsDivM1.textContent = output;
        lastMode1ResultText = output; // 存储纯文本

        // (v1.0 喷油版) 缓存结果 (移除 eta_s, eta_total)
        lastMode1Results = {
            fluid,
            rpm_val, // 可能为 NaN
            flow_mode,
            V_rev_cm3_val, // 可能为 NaN
            V_th_m3_h_val,
            Te_C,
            Tc_C,
            dT_sh_K,
            dT_sc_K,
            power_mode,
            motor_eff_val,
            eta_v: isNaN(eta_v) ? null : eta_v,
            // (v1.0) 移除等熵效率
            // eta_s_shaft: isNaN(eta_s_shaft) ? null : eta_s_shaft,
            // eta_s_total: isNaN(eta_s_total) ? null : eta_s_total
        };
        transferButton.disabled = false;
        printButtonM1.disabled = false;

        setButtonFresh();

    } catch (error) {
        resultsDivM1.textContent = `计算出错: ${error.message}\n\n请检查输入参数是否在工质的有效范围内。`;
        console.error(error);
        
        lastMode1Results = null;
        lastMode1ResultText = null;
        transferButton.disabled = true;
        printButtonM1.disabled = true;
    }
}

/**
 * (v1.0 喷油版) 准备模式一的打印报告
 */
function printReportMode1() {
    if (!lastMode1ResultText) {
        alert("没有可打印的结果。");
        return;
    }

    // 1. 收集所有输入
    const flow_mode_val = document.querySelector('input[name="flow_mode"]:checked').value;
    
    const inputs = {
        "报告类型": "模式一: 性能评估 (喷油版)",
        "制冷剂": fluidSelectM1.value,
        "理论输气量模式": flow_mode_val === 'rpm' ? '按转速与排量' : '按体积流量',
        "压缩机转速 (RPM)": flow_mode_val === 'rpm' ? document.getElementById('rpm').value : 'N/A',
        "每转排量 (cm³/rev)": flow_mode_val === 'rpm' ? document.getElementById('displacement').value : 'N/A',
        "理论体积流量 (m³/h)": flow_mode_val === 'vol' ? document.getElementById('flow_m3h').value : 'N/A',
        "容量模式": document.querySelector('input[name="capacity_mode"]:checked').value === 'heating' ? '制热量 (冷凝器)' : '制冷量',
        "输入容量 (kW)": document.getElementById('capacity').value,
        "功率模式": document.querySelector('input[name="power_mode"]:checked').value === 'input' ? '输入功率 (电机)' : '轴功率',
        "输入功率 (kW)": document.getElementById('power').value,
        "电机效率": document.querySelector('input[name="power_mode"]:checked').value === 'input' ? document.getElementById('motor_eff').value : 'N/A',
        "蒸发温度 (°C)": document.getElementById('temp_evap').value,
        "冷凝温度 (°C)": document.getElementById('temp_cond').value,
        "有效过热度 (K)": document.getElementById('superheat').value,
        "过冷度 (K)": document.getElementById('subcooling').value,
        "实际排气温度 T2a (°C)": document.getElementById('temp_discharge_m1').value, // (v1.0) 新增
    };

    // 2. 生成打印HTML
    let printHtml = `
        <h1>压缩机性能计算报告</h1>
        <p>计算时间: ${new Date().toLocaleString('zh-CN')}</p>
        <h2>1. 输入参数 (模式一)</h2>
        <table class="print-table">
            ${Object.entries(inputs).map(([key, value]) => `
                <tr>
                    <th>${key}</th>
                    <td>${value}</td>
                </tr>
            `).join('')}
        </table>
        <h2>2. 计算结果 (模式一)</h2>
        <pre class="print-results">${lastMode1ResultText}</pre>
        <h3>--- 报告结束 (编者: 荆炎荣) ---</h3>
    `;
    
    // 3. 执行打印 (调用全局打印函数)
    callPrint(printHtml);
}

/**
 * (v1.0 喷油版) 转换数据到模式二
 */
function transferToMode2() {
    if (!lastMode1Results) {
        alert("没有可代入的数据。请先在模式一中成功计算。");
        return;
    }
    
    const data = lastMode1Results;

    // 1. 代入通用工况
    document.getElementById('fluid_m2').value = data.fluid;
    document.getElementById('temp_evap_m2').value = data.Te_C;
    document.getElementById('temp_cond_m2').value = data.Tc_C;
    document.getElementById('superheat_m2').value = data.dT_sh_K;
    document.getElementById('subcooling_m2').value = data.dT_sc_K;
    
    // 2. 代入流量模式
    const flowModeRpmM2 = document.getElementById('flow_mode_rpm_m2');
    const flowModeVolM2 = document.getElementById('flow_mode_vol_m2');
    if (data.flow_mode === 'rpm') {
        flowModeRpmM2.checked = true;
        document.getElementById('rpm_m2').value = data.rpm_val; 
        document.getElementById('displacement_m2').value = data.V_rev_cm3_val;
        flowModeRpmM2.dispatchEvent(new Event('change'));
    } else {
        flowModeVolM2.checked = true;
        document.getElementById('flow_m3h_m2').value = data.V_th_m3_h_val;
        flowModeVolM2.dispatchEvent(new Event('change'));
    }

    // 3. 代入容积效率
    const etaVInputM2 = document.getElementById('eta_v_m2');
    if (data.eta_v === null || isNaN(data.eta_v)) {
        alert("警告: 模式一未能算出有效的容积效率 (η_v)。将使用默认值 0.85。");
        etaVInputM2.value = 0.85; // 填入默认值
    } else {
        etaVInputM2.value = data.eta_v.toFixed(3);
    }
    
    // 4. (v1.0 喷油版) 处理等熵效率
    // 由于 data.eta_s_total 和 data.eta_s_shaft 均为 null/undefined, 
    // 此逻辑将自动落入 'else' 分支, 提示用户并设置默认值。
    const effModeInputM2 = document.getElementById('eff_mode_input_m2');
    const effModeShaftM2 = document.getElementById('eff_mode_shaft_m2');
    const etaSInputM2 = document.getElementById('eta_s_m2');

    if (data.eta_s_total !== null && data.eta_s_total !== undefined) {
        // (此分支在新版中不会被执行)
        effModeInputM2.checked = true;
        etaSInputM2.value = data.eta_s_total.toFixed(3);
        document.getElementById('motor_eff_m2').value = data.motor_eff_val;
        effModeInputM2.dispatchEvent(new Event('change'));
        
    } else if (data.eta_s_shaft !== null && data.eta_s_shaft !== undefined) {
        // (此分支在新版中不会被执行)
        effModeShaftM2.checked = true;
        etaSInputM2.value = data.eta_s_shaft.toFixed(3);
        effModeShaftM2.dispatchEvent(new Event('change'));

    } else {
        // (v1.0 喷油版) 将执行此分支
        alert("提示: 模式一 (喷油) 无法计算等熵效率。\n模式二将使用默认等熵效率 (η_s = 0.7) 进行预测。");
        effModeShaftM2.checked = true;
        etaSInputM2.value = 0.7; // 填入默认值
        effModeShaftM2.dispatchEvent(new Event('change'));
    }

    // 5. 更新制冷剂信息
    updateFluidInfo(document.getElementById('fluid_m2'), document.getElementById('fluid-info-m2'), CP_INSTANCE);
    
    // 6. 自动切换视图
    const tabBtnM2 = document.getElementById('tab-btn-m2');
    if (tabBtnM2) {
        tabBtnM2.click();
    }
    
    // 7. 提示用户
    document.getElementById('results-mode-2').textContent = "--- 数据已从模式一代入 (η_s 除外) --- \n--- 请检查等熵效率并点击计算 ---";
    // 触发模式二的“脏检查”
    document.getElementById('calc-button-mode-2').dispatchEvent(new Event('stale'));
}


/**
 * 打印报告的核心函数 (全局)
 * @param {string} printHtml - 要打印的 HTML 内容
 */
function callPrint(printHtml) {
    let printContainer = document.getElementById('print-container');
    if (printContainer) {
        printContainer.remove();
    }
    printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    printContainer.innerHTML = printHtml;
    document.body.appendChild(printContainer);
    window.print();
    setTimeout(() => {
        if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
        }
    }, 500);
}


/**
 * 模式一：初始化函数
 * @param {object} CP - CoolProp 实例
 */
export function initMode1(CP) {
    CP_INSTANCE = CP; // 将 CP 实例存储在模块作用域
    
    // 获取 DOM 元素
    calcButtonM1 = document.getElementById('calc-button-mode-1');
    resultsDivM1 = document.getElementById('results-mode-1');
    calcFormM1 = document.getElementById('calc-form-mode-1');
    transferButton = document.getElementById('transfer-to-mode-2');
    printButtonM1 = document.getElementById('print-button-mode-1');
    fluidSelectM1 = document.getElementById('fluid');
    fluidInfoDivM1 = document.getElementById('fluid-info');
    allInputsM1 = calcFormM1.querySelectorAll('input, select');

    // 绑定计算事件
    calcFormM1.addEventListener('submit', (event) => {
        event.preventDefault();
        calculateMode1();
    });

    // 绑定“脏”状态检查
    allInputsM1.forEach(input => {
        input.addEventListener('input', setButtonStale);
        input.addEventListener('change', setButtonStale);
    });

    // 绑定流体信息更新
    fluidSelectM1.addEventListener('change', () => {
        updateFluidInfo(fluidSelectM1, fluidInfoDivM1, CP_INSTANCE);
    });

    // 绑定打印按钮
    printButtonM1.addEventListener('click', printReportMode1);
    
    // 绑定转换按钮
    transferButton.addEventListener('click', transferToMode2);

    console.log("模式一 (喷油评估 v1.0) 已初始化。");
}