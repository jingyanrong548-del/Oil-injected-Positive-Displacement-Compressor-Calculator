// =====================================================================
// efficiency_models.js: 经验效率模型
// 版本: v1.0
// 职责: 根据压力比(PR)估算容积效率和等熵/等温效率。
// =====================================================================

/**
 * 根据压力比计算经验效率值
 * @param {number} pressureRatio - 压力比 (Pc / Pe)
 * @returns {object} 包含 { eta_v, eta_s, eta_iso } 的效率对象
 */
export function calculateEmpiricalEfficiencies(pressureRatio) {
    // 确保压力比有效，防止计算错误
    if (isNaN(pressureRatio) || pressureRatio < 1) {
        return { eta_v: 0.90, eta_s: 0.75, eta_iso: 0.70 }; // 返回一组安全的默认值
    }

    // --- 1. 容积效率 (η_v) 模型: 线性衰减 ---
    const ETA_V_BASE = 0.98;         // 基础容积效率 (PR=1时)
    const PENALTY_V = 0.015;         // 容积效率衰减系数
    const ETA_V_MIN = 0.65;          // 最小容积效率
    let eta_v = ETA_V_BASE - (pressureRatio - 1) * PENALTY_V;
    eta_v = Math.max(ETA_V_MIN, eta_v); // 确保不低于下限

    // --- 2. 等熵/等温效率 (η_s, η_iso) 模型: 抛物线形 ---
    const ETA_S_PEAK = 0.80;         // 峰值等熵效率
    const PR_SWEET_SPOT = 4.0;       // 最佳效率点对应的压力比
    const PENALTY_S = 0.018;         // 等熵效率衰减系数
    const ETA_S_MIN = 0.50;          // 最小等熵效率
    let eta_s = ETA_S_PEAK - Math.abs(pressureRatio - PR_SWEET_SPOT) * PENALTY_S;
    eta_s = Math.max(ETA_S_MIN, eta_s); // 确保不低于下限

    // 等温效率与等熵效率关联
    const ISO_FACTOR = 0.92;
    let eta_iso = eta_s * ISO_FACTOR;

    // 返回计算结果，保留3位小数
    return {
        eta_v: parseFloat(eta_v.toFixed(3)),
        eta_s: parseFloat(eta_s.toFixed(3)),
        eta_iso: parseFloat(eta_iso.toFixed(3))
    };
}