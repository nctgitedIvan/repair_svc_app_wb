'use strict';

/**
 * spike-hello —— P0 驗證端點（不是業務代碼，驗證通過後刪除）。
 *
 * 本端點回答 P0 的五個問題：
 *   P0-1  packages/* 能否被同步進雲函數並在**雲端**載入？
 *   P0-2  共享碼的相對 require 是否正常？（@repair/* 子路徑解析）
 *   P0-3  注入共享碼後，程式碼包多大？（由 devtools 顯示）
 *   P0-5  assertSharedBuild 是否真的會在版本不符時擋下？
 *   P0-6  環境是否正確（ENV / Node 版本）
 *
 * 入口職責邊界（docs/01-目標架構.md §1.6.4）：
 *   只做 ① 參數校驗 ② 身分驗證 ③ 呼叫 use case ④ 回傳結果。
 *   本檔為驗證端點，省略 ②（無業務資料），其餘示範標準寫法。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ── 共享碼守衛：模組載入即檢查，失敗則整個函數無法啟動 ──
const { assertSharedBuild, buildContainer } = require('./bootstrap');
assertSharedBuild();

const manifest = require('@repair/build-manifest');
const { Money, Rounding } = require('@repair/shared-kernel/Money');
const { Result } = require('@repair/shared-kernel/Result');
const { OrderStatus, canExecuteProfitSharing } = require('@repair/domain/order/OrderStatus');
const { ComputeProfitShareUseCase } = require('@repair/application/settlement/ComputeProfitShareUseCase');

const container = buildContainer();

const SPIKE_ORDER_ID = 'spike-order-1';

function seedSpikeOrder() {
  container.orderRepository.seed([
    {
      id: SPIKE_ORDER_ID,
      orderNo: 'SPIKE0001',
      statusValue: OrderStatus.COMPLETED.value,
      serviceFeeCents: 10000, // 100.00 元服務費
      materialFeeCents: 2500, // 25.00 元材料費（不參與分潤）
      createdAt: 0,
      version: 0,
      snapshot: {
        profitSharingTerms: {
          base: 'SERVICE_FEE',
          technicianRateBp: 8000,
          platformRateBp: 2000,
          roundingMode: Rounding.FLOOR_TO_CENT,
          termsVersion: 'v1',
        },
      },
    },
  ]);
}

exports.main = async (event) => {
  const startedAt = container.clock.now();
  seedSpikeOrder();

  // ③ 呼叫 use case（示範標準寫法：new UseCase(container)，不 new adapter）
  const useCase = new ComputeProfitShareUseCase(container);
  const result = await useCase.execute({
    actor: { id: 'spike-runner', role: 'admin' },
    orderId: SPIKE_ORDER_ID,
  });

  // ④ 回傳結果
  return {
    ok: true,
    message: 'P0 共享碼驗證端點',
    runtime: {
      node: process.version,
      env: cloud.getWXContext().ENV || '(未取得)',
      openid: cloud.getWXContext().OPENID ? '(有)' : '(無)',
      elapsedMs: container.clock.now() - startedAt,
    },
    sharedBuild: {
      hash: manifest.hash,
      hashFromPackageJson: require('./package.json').repairSharedHash,
      matches: manifest.hash === require('./package.json').repairSharedHash,
      packages: manifest.packages,
      builtAt: manifest.builtAt,
    },
    // 這些斷言若在雲端成立，代表共享碼在雲函數中真的可執行
    checks: {
      sharedKernelLoaded: Money.fromCents(10000).toYuanString() === '100.00',
      domainLoaded: OrderStatus.COMPLETED.value === 70 && OrderStatus.DISPUTED.value === 65,
      resultLoaded: Result.ok(1).ok === true,
      // DISPUTED 必須凍結分帳 —— 這是最重要的 domain 規則
      disputedFreezesProfitSharing: canExecuteProfitSharing(OrderStatus.DISPUTED) === false,
      completedAllowsProfitSharing: canExecuteProfitSharing(OrderStatus.COMPLETED) === true,
    },
    profitShare: result.ok ? result.value : { error: result.error },
    receivedEvent: event,
  };
};
