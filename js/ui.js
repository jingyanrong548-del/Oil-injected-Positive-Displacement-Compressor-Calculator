// =====================================================================
// ui.js: UI 界面交互逻辑 (喷油版 v1.0)
// 职责: 1. 处理主选项卡 (M1, M2, M3)
//        2. 处理所有流量模式电台
//        3. 处理功率/效率模式电台
//        4. 处理后冷却器复选框
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- (v1.0) 主选项卡切换 (M1, M2, M3) ---
    const tabBtnM1 = document.getElementById('tab-btn-m1');
    const tabBtnM2 = document.getElementById('tab-btn-m2');
    const tabBtnM3 = document.getElementById('tab-btn-m3');
    
    const contentM1 = document.getElementById('tab-content-m1');
    const contentM2 = document.getElementById('tab-content-m2');
    const contentM3 = document.getElementById('tab-content-m3');

    const tabs = [
        { btn: tabBtnM1, content: contentM1 },
        { btn: tabBtnM2, content: contentM2 },
        { btn: tabBtnM3, content: contentM3 }
        // 移除了 M4
    ];

    tabs.forEach(tab => {
        // 确保按钮和内容都存在
        if (tab.btn && tab.content) {
            tab.btn.addEventListener('click', () => {
                // 1. 重置所有
                tabs.forEach(t => {
                    if (t.btn && t.content) {
                        t.btn.classList.remove('active');
                        t.content.style.display = 'none';
                        t.content.classList.remove('active');
                    }
                });
                // 2. 激活当前
                tab.btn.classList.add('active');
                tab.content.style.display = 'block';
                tab.content.classList.add('active');
            });
        }
    });

    // --- 流量模式 (Flow Mode) 电台切换 ---
    // Helper function to setup flow mode toggles
    /**
     * (v4.3 修复)
     * 修复了硬编码 'rpm' 导致的模式四 (mass/vol) 切换逻辑错误
     * (v1.0 喷油版) 此函数可重用
     */
    function setupFlowModeToggle(radioName, firstInputsId, secondInputsId) {
        const radios = document.querySelectorAll(`input[name="${radioName}"]`);
        const firstInputs = document.getElementById(firstInputsId);
        const secondInputs = document.getElementById(secondInputsId);

        if (!radios.length || !firstInputs || !secondInputs) return;

        // [FIX] 动态获取第一个单选按钮的 value (例如 'rpm' 或 'mass')
        // 这假设 HTML 中单选按钮的顺序与参数传入的 ID 顺序一致
        const firstValue = radios[0].value;

        const toggle = (val) => {
            if (val === firstValue) { // [FIX] 不再硬编码 'rpm', 而是比较 firstValue
                firstInputs.style.display = 'block';
                secondInputs.style.display = 'none';
                firstInputs.querySelectorAll('input').forEach(i => i.required = true);
                secondInputs.querySelectorAll('input').forEach(i => i.required = false);
            } else {
                firstInputs.style.display = 'none';
                secondInputs.style.display = 'block';
                firstInputs.querySelectorAll('input').forEach(i => i.required = false);
                secondInputs.querySelectorAll('input').forEach(i => i.required = true);
            }
        };

        radios.forEach(radio => {
            radio.addEventListener('change', () => toggle(radio.value));
        });
        
        // 初始状态
        const checkedRadio = document.querySelector(`input[name="${radioName}"]:checked`);
        if (checkedRadio) {
            toggle(checkedRadio.value);
        }
    }

    setupFlowModeToggle('flow_mode', 'rpm-inputs-m1', 'vol-inputs-m1');
    setupFlowModeToggle('flow_mode_m2', 'rpm-inputs-m2', 'vol-inputs-m2');
    setupFlowModeToggle('flow_mode_m3', 'rpm-inputs-m3', 'vol-inputs-m3'); // (v1.0 喷油版) 对应 M3
    // 移除了 M4 的 flow mode
    

    // --- 功率模式 (Power Mode) 切换 ---
    function setupPowerModeToggle(radioName, motorEffGroupId) {
        const radios = document.querySelectorAll(`input[name="${radioName}"]`);
        const motorEffGroup = document.getElementById(motorEffGroupId);

        if (!radios.length || !motorEffGroup) return;

        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'input') {
                    motorEffGroup.style.display = 'block';
                    motorEffGroup.querySelector('input').required = true;
                } else {
                    motorEffGroup.style.display = 'none';
                    motorEffGroup.querySelector('input').required = false;
                }
            });
        });
        
        // 初始状态
        const checkedRadio = document.querySelector(`input[name="${radioName}"]:checked`);
        if (checkedRadio) {
             checkedRadio.dispatchEvent(new Event('change'));
        }
    }
    
    setupPowerModeToggle('power_mode', 'motor-eff-group-m1');
    setupPowerModeToggle('eff_mode_m2', 'motor-eff-group-m2'); // M2 效率模式
    setupPowerModeToggle('eff_mode_m3', 'motor-eff-group-m3'); // (v1.0 喷油版) 对应 M3 (原 M2B)


    // --- 容量模式 (Capacity Mode) 切换 (M1) ---
    const capacityRadios = document.querySelectorAll('input[name="capacity_mode"]');
    const capacityLabel = document.getElementById('capacity-label');
    if (capacityRadios.length && capacityLabel) {
        capacityRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'heating') {
                    capacityLabel.textContent = '制热量 (kW)';
                } else {
                    capacityLabel.textContent = '制冷量 (kW)';
                }
            });
        });
    }
    
    // --- 功率标签 (Power Label) 切换 (M1) ---
    const powerRadios = document.querySelectorAll('input[name="power_mode"]');
    const powerLabel = document.getElementById('power-label');
    if(powerRadios.length && powerLabel) {
        powerRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'input') {
                    powerLabel.textContent = '输入功率 (kW) (电机)';
                } else {
                    powerLabel.textContent = '轴功率 (kW)';
                }
            });
        });
    }

    // --- M2 效率标签 (Efficiency Label) 切换 ---
    const effRadiosM2 = document.querySelectorAll('input[name="eff_mode_m2"]');
    const effLabelM2 = document.getElementById('eta_s_label_m2');
    const effTooltipM2 = document.getElementById('tooltip-eta-s-m2');
    if (effRadiosM2.length && effLabelM2 && effTooltipM2) {
        effRadiosM2.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'input') {
                    effLabelM2.childNodes[0].nodeValue = '总等熵效率 (η_total) ';
                    effTooltipM2.textContent = '基于【输入功率】。η_total = 理论等熵功率 / 电机输入功率。';
                } else {
                    effLabelM2.childNodes[0].nodeValue = '等熵效率 (η_s) ';
                    effTooltipM2.textContent = '基于【轴功率】。η_s = 理论等熵功率 / 压缩机轴功率。';
                }
            });
        });
    }

    // --- M3 (气体) 效率标签 (Efficiency Label) 切换 (v1.0 喷油版) ---
    // (基于原 M2B 逻辑, 但适配 M3 的 ID 和等温效率)
    const effRadiosM3 = document.querySelectorAll('input[name="eff_mode_m3"]');
    const effLabelM3 = document.getElementById('eta_iso_label_m3');
    const effTooltipM3 = document.getElementById('tooltip-eta-iso-m3');
    if (effRadiosM3.length && effLabelM3 && effTooltipM3) {
        effRadiosM3.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'input') {
                    effLabelM3.childNodes[0].nodeValue = '总等温效率 (η_iso_total) ';
                    effTooltipM3.textContent = '基于【输入功率】。η_iso_total = 理论等温功率 / 电机输入功率。';
                } else {
                    effLabelM3.childNodes[0].nodeValue = '等温效率 (η_iso) ';
                    effTooltipM3.textContent = '基于【轴功率】。η_iso = 理论等温功率 / 压缩机轴功率。';
                }
            });
        });
    }

    // --- (v1.0 喷油版) 移除 MVR 状态定义 (Inlet/Outlet) 电台切换 ---
    // (移除 setupStateToggle)


    // --- 后冷却器 (Cooler) 复选框 ---
    function setupCoolerToggle(checkboxId, inputsDivId) {
        const checkbox = document.getElementById(checkboxId);
        const inputsDiv = document.getElementById(inputsDivId);
        
        if (!checkbox || !inputsDiv) return;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                inputsDiv.style.display = 'block';
            } else {
                inputsDiv.style.display = 'none';
            }
        });
    }
    
    setupCoolerToggle('enable_cooler_calc_m2', 'cooler-inputs-m2');
    setupCoolerToggle('enable_cooler_calc_m3', 'cooler-inputs-m3'); // (v1.0 喷油版) 对应 M3
    
    // --- (v1.0 喷油版) 移除 模式 2A / 2B 子选项卡切换 ---
    //

});