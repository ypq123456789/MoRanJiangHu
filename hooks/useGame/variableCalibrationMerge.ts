import type { GameResponse, TavernCommand } from '../../types';

export const 合并变量校准结果到响应 = (
    baseResponse: GameResponse,
    calibration: {
        commands?: TavernCommand[];
        reports?: string[];
        model?: string;
    }
): GameResponse => {
    const baseCommands = Array.isArray(baseResponse?.tavern_commands) ? baseResponse.tavern_commands : [];
    const supplemental = Array.isArray(calibration?.commands) ? calibration.commands : [];
    const mergedCommands = [...baseCommands, ...supplemental];

    return {
        ...baseResponse,
        tavern_commands: mergedCommands,
        variable_calibration_report: Array.isArray(calibration?.reports) && calibration.reports.length > 0
            ? calibration.reports
            : undefined,
        variable_calibration_commands: supplemental.length > 0 ? supplemental : undefined,
        variable_calibration_model: calibration?.model || undefined
    };
};
