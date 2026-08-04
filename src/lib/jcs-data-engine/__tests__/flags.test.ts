import { describe, it, expect } from "vitest";
import { isSmartFlowAvailable } from "../flags.functions";

describe("isSmartFlowAvailable — flags do Smart Flow", () => {
  it("OFF quando qualquer flag ausente", () => {
    expect(isSmartFlowAvailable({})).toBe(false);
    expect(isSmartFlowAvailable({ jcs_data_engine_enabled: true })).toBe(false);
    expect(isSmartFlowAvailable({ smart_flow_ui_enabled: true })).toBe(false);
  });
  it("OFF quando qualquer flag false", () => {
    expect(isSmartFlowAvailable({ jcs_data_engine_enabled: true, smart_flow_ui_enabled: false })).toBe(false);
    expect(isSmartFlowAvailable({ jcs_data_engine_enabled: false, smart_flow_ui_enabled: true })).toBe(false);
  });
  it("ON somente quando ambas true (fluxo legado protegido)", () => {
    expect(isSmartFlowAvailable({ jcs_data_engine_enabled: true, smart_flow_ui_enabled: true })).toBe(true);
  });
});