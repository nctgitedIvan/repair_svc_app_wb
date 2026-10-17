'use strict';

/**
 * @repair/entrypoint-kit —— 雲函數入口的共用中介層。
 *
 * 依賴：@repair/shared-kernel、@repair/ports（僅介面）。
 * **不依賴 wx-server-sdk，不 new 任何 adapter。**
 *
 * 為什麼需要獨立成套件（而非放進 application 或各雲函數各一份）：
 *   - 放 application：它需要 UserRepository，會讓 application 承擔非業務職責
 *   - 各雲函數各一份：4 份會走鐘的副本
 */

const { validate } = require('./validate');
const { authenticate } = require('./authenticate');
const { toResponse } = require('./toResponse');
const { createHandler } = require('./createHandler');
const { createRouter } = require('./createRouter');

module.exports = { validate, authenticate, toResponse, createHandler, createRouter };
