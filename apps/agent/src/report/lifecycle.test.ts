/**
 * lifecycle.ts 单元测试
 *
 * 覆盖范围：
 * - INCIDENT_PHASE 四阶段齐全
 * - isIncidentPhase 类型守卫
 * - phaseIndex / phaseIsAfter 顺序判断
 * - latestPhase 从记录列表中提取最新阶段
 * - buildLifecycle 组装生命周期结构
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  INCIDENT_PHASE,
  INCIDENT_SEVERITY,
  INCIDENT_MITIGATION_STATUS,
} from "../constants.js";
import {
  buildLifecycle,
  isIncidentPhase,
  latestPhase,
  phaseIndex,
  phaseIsAfter,
  type PhaseRecord,
} from "./lifecycle.js";

describe("INCIDENT_PHASE 常量", () => {
  test("四阶段齐全", () => {
    assert.equal(INCIDENT_PHASE.DETECTED, "detected", "DETECTED 应为 detected");
    assert.equal(
      INCIDENT_PHASE.DIAGNOSED,
      "diagnosed",
      "DIAGNOSED 应为 diagnosed",
    );
    assert.equal(
      INCIDENT_PHASE.MITIGATED,
      "mitigated",
      "MITIGATED 应为 mitigated",
    );
    assert.equal(INCIDENT_PHASE.REVIEWED, "reviewed", "REVIEWED 应为 reviewed");
  });

  test("SEVERITY 三档齐全", () => {
    assert.equal(INCIDENT_SEVERITY.P0, "P0", "P0 应存在");
    assert.equal(INCIDENT_SEVERITY.P1, "P1", "P1 应存在");
    assert.equal(INCIDENT_SEVERITY.P2, "P2", "P2 应存在");
  });

  test("MITIGATION_STATUS 两态齐全", () => {
    assert.equal(
      INCIDENT_MITIGATION_STATUS.MITIGATED,
      "mitigated",
      "MITIGATED 应为 mitigated",
    );
    assert.equal(
      INCIDENT_MITIGATION_STATUS.UNMITIGATED,
      "unmitigated",
      "UNMITIGATED 应为 unmitigated",
    );
  });
});

describe("isIncidentPhase", () => {
  test("合法阶段返回 true", () => {
    assert.equal(isIncidentPhase("detected"), true, "detected 应合法");
    assert.equal(isIncidentPhase("diagnosed"), true, "diagnosed 应合法");
    assert.equal(isIncidentPhase("mitigated"), true, "mitigated 应合法");
    assert.equal(isIncidentPhase("reviewed"), true, "reviewed 应合法");
  });

  test("非法字符串返回 false", () => {
    assert.equal(isIncidentPhase("resolved"), false, "resolved 不合法");
    assert.equal(isIncidentPhase(""), false, "空串不合法");
    assert.equal(isIncidentPhase("DETECTED"), false, "大写不合法");
  });
});

describe("phaseIndex / phaseIsAfter", () => {
  test("阶段顺序严格递增", () => {
    assert.equal(phaseIndex("detected"), 0, "detected 索引应为 0");
    assert.equal(phaseIndex("diagnosed"), 1, "diagnosed 索引应为 1");
    assert.equal(phaseIndex("mitigated"), 2, "mitigated 索引应为 2");
    assert.equal(phaseIndex("reviewed"), 3, "reviewed 索引应为 3");
  });

  test("phaseIsAfter 按定义顺序判断", () => {
    assert.equal(
      phaseIsAfter("diagnosed", "detected"),
      true,
      "diagnosed 应在 detected 之后",
    );
    assert.equal(
      phaseIsAfter("detected", "diagnosed"),
      false,
      "detected 不在 diagnosed 之后",
    );
    assert.equal(
      phaseIsAfter("reviewed", "detected"),
      true,
      "reviewed 应在 detected 之后",
    );
    assert.equal(
      phaseIsAfter("mitigated", "mitigated"),
      false,
      "同阶段不应为之后",
    );
  });
});

describe("latestPhase / buildLifecycle", () => {
  test("空列表时 latestPhase 回退到 detected", () => {
    assert.equal(
      latestPhase([]),
      "detected",
      "空列表时应回退到 detected",
    );
  });

  test("latestPhase 按阶段顺序返回最大值", () => {
    const records: PhaseRecord[] = [
      { phase: "detected", at: "2026-06-11T10:00:00Z" },
      { phase: "mitigated", at: "2026-06-11T10:30:00Z" },
      { phase: "diagnosed", at: "2026-06-11T10:15:00Z" },
    ];
    assert.equal(latestPhase(records), "mitigated", "应返回 mitigated");
  });

  test("buildLifecycle 组装结构与 current 字段", () => {
    const records: PhaseRecord[] = [
      { phase: "detected", at: "2026-06-11T10:00:00Z", note: "报警" },
      { phase: "diagnosed", at: "2026-06-11T10:10:00Z" },
    ];
    const lifecycle = buildLifecycle(records);
    assert.equal(lifecycle.phases.length, 2, "phases 应保留全部记录");
    assert.equal(lifecycle.current, "diagnosed", "current 应为最新阶段");
    assert.equal(
      lifecycle.phases[0]?.note,
      "报警",
      "phases 内 note 应透传",
    );
  });
});
