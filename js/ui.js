// =====================================================================
// ui.js: UI 界面交互逻辑 - (v2.4 Bug修复版)
// 职责: 1. 处理主选项卡
//        2. 处理各模式的UI动态交互
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- 主选项卡切换 ---
    const tabBtnM2 = document.getElementById('tab-btn-m2');
    const tabBtnM3 = document.getElementById('tab-btn-m3');
    const contentM2 = document.getElementById('tab-content-m2');
    const contentM3 = document.getElementById('tab-content-m3');
    const tabs = [{ btn: tabBtnM2, content: contentM2 }, { btn: tabBtnM3, content: contentM3 }];

    tabs.forEach(tab => {
        if (tab.btn && tab.content) {
            tab.btn.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.btn.classList.remove('active');
                    t.content.classList.remove('active');
                });
                tab.btn.classList.add('active');
                tab.content.classList.add('active');
            });
        }
    });

    // --- 通用设置函数 ---
    function setupRadioToggle(radioName, onToggle) {
        const radios = document.querySelectorAll(`input[name="${radioName}"]`);
        if (!radios.length) return;
        radios.forEach(radio => radio.addEventListener('change', () => onToggle(radio.value)));
        const checkedRadio = document.querySelector(`input[name="${radioName}"]:checked`);
        if (checkedRadio) onToggle(checkedRadio.value);
    }

    // --- 流量模式切换 ---
    setupRadioToggle('flow_mode_m2', (value) => {
        document.getElementById('rpm-inputs-m2').style.display = (value === 'rpm') ? 'block' : 'none';
        document.getElementById('vol-inputs-m2').style.display = (value === 'vol') ? 'block' : 'none';
        document.getElementById('rpm-inputs-m2').querySelectorAll('input').forEach(i => i.required = (value === 'rpm'));
        document.getElementById('vol-inputs-m2').querySelectorAll('input').forEach(i => i.required = (value === 'vol'));
    });
    setupRadioToggle('flow_mode_m3', (value) => {
        document.getElementById('rpm-inputs-m3').style.display = (value === 'rpm') ? 'block' : 'none';
        document.getElementById('vol-inputs-m3').style.display = (value === 'vol') ? 'block' : 'none';
        document.getElementById('rpm-inputs-m3').querySelectorAll('input').forEach(i => i.required = (value === 'rpm'));
        document.getElementById('vol-inputs-m3').querySelectorAll('input').forEach(i => i.required = (value === 'vol'));
    });

    // --- 功率/效率基准切换 (控制电机效率框) ---
    setupRadioToggle('eff_mode_m2', (value) => {
        document.getElementById('motor-eff-group-m2').style.display = (value === 'input') ? 'block' : 'none';
        const label = document.getElementById('eta_s_label_m2');
        const tooltip = document.getElementById('tooltip-eta-s-m2');
        // 使用更稳健的方式修改文本节点
        for (const node of label.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.nodeValue = (value === 'input') ? '总等熵效率 (η_total)' : '等熵效率 (η_s)';
                break;
            }
        }
        tooltip.textContent = (value === 'input') ? '基于【输入功率】。η_total = 理论等熵功率 / 电机输入功率。' : '基于【轴功率】。η_s = 理论等熵功率 / 压缩机轴功率。';
    });
    setupRadioToggle('eff_mode_m3', (value) => {
        document.getElementById('motor-eff-group-m3').style.display = (value === 'input') ? 'block' : 'none';
    });
    
    // --- (v2.4 Bug修复) 模式二(气体压缩)的效率类型切换 ---
    const effTypeRadiosM3 = document.querySelectorAll('input[name="eff_type_m3"]');
    const effModeRadiosM3 = document.querySelectorAll('input[name="eff_mode_m3"]');
    const effLabelM3 = document.getElementById('eta_label_m3');
    const effTooltipM3 = document.getElementById('tooltip-eta_m3');

    if (effTypeRadiosM3.length && effLabelM3 && effTooltipM3) {
        const toggleM3EfficiencyLabel = () => {
            const isInputMode = document.querySelector('input[name="eff_mode_m3"]:checked').value === 'input';
            const effType = document.querySelector('input[name="eff_type_m3"]:checked').value;
            let labelText = '';
            let tooltipText = '';

            if (effType === 'isothermal') {
                labelText = isInputMode ? '总等温效率 (η_iso_total) ' : '等温效率 (η_iso) ';
                tooltipText = isInputMode ? 'η_iso_total = 理论等温功率 / 电机输入功率' : 'η_iso = 理论等温功率 / 压缩机轴功率';
            } else { // isentropic
                labelText = isInputMode ? '总等熵效率 (η_s_total) ' : '等熵效率 (η_s) ';
                tooltipText = isInputMode ? 'η_s_total = 理论等熵功率 / 电机输入功率' : 'η_s = 理论等熵功率 / 压缩机轴功率';
            }
            
            // 关键修复：使用更稳健的方式找到并修改文本节点
            for (const node of effLabelM3.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                    node.nodeValue = labelText;
                    break; // 只修改第一个非空文本节点
                }
            }
            effTooltipM3.textContent = tooltipText;
        };

        // 为两组单选框都添加事件监听
        effTypeRadiosM3.forEach(radio => radio.addEventListener('change', toggleM3EfficiencyLabel));
        effModeRadiosM3.forEach(radio => radio.addEventListener('change', toggleM3EfficiencyLabel));

        // 页面加载时立即执行一次，确保初始状态正确
        toggleM3EfficiencyLabel();
    }
});