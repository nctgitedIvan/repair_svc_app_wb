'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const appointment = require('../../../utils/appointment');

const NOW = 1_700_000_000_000; // 2023-11-14

function args(over = {}) {
  return {
    addressText: '廣東省深圳市寶安區沙井街道中心路28號3棟5B',
    appointmentDate: '2030-01-01',
    appointmentTime: '10:30',
    contactName: '王小明',
    contactPhone: '+86 138 1234 5678',
    description: '冷氣不冷',
    mediaUrls: ['wxfile://a.jpg', 'audio:3'],
    now: NOW,
    ...over,
  };
}

test('appointment：合法表單', async (t) => {
  await t.test('回傳完整 info', () => {
    const result = appointment.buildAppointmentInfo(args());
    assert.ok(result.info);
    assert.equal(result.info.contactName, '王小明');
    assert.equal(result.info.contactPhone, '+86 138 1234 5678');
    assert.equal(result.info.description, '冷氣不冷');
    assert.deepEqual(result.info.mediaUrls, ['wxfile://a.jpg', 'audio:3']);
    assert.equal(typeof result.info.appointmentAt, 'number');
  });

  await t.test('澳門手機（853）可用', () => {
    const result = appointment.buildAppointmentInfo(args({ contactPhone: '+853 6612 3456' }));
    assert.ok(result.info);
  });

  await t.test('空白描述與空附件可用', () => {
    const result = appointment.buildAppointmentInfo(args({ description: '  ', mediaUrls: [] }));
    assert.equal(result.info.description, '');
    assert.deepEqual(result.info.mediaUrls, []);
  });
});

test('appointment：驗證失敗', async (t) => {
  await t.test('缺地址', () => {
    assert.equal(appointment.buildAppointmentInfo(args({ addressText: '' })).error, '請選擇服務地址');
  });

  await t.test('缺日期或時間', () => {
    assert.equal(appointment.buildAppointmentInfo(args({ appointmentDate: '' })).error, '請選擇預約時間');
    assert.equal(appointment.buildAppointmentInfo(args({ appointmentTime: '' })).error, '請選擇預約時間');
  });

  await t.test('不存在的日期（2 月 31 日）', () => {
    assert.equal(
      appointment.buildAppointmentInfo(args({ appointmentDate: '2030-02-31' })).error,
      '預約時間格式不正確',
    );
  });

  await t.test('過去時間', () => {
    assert.equal(
      appointment.buildAppointmentInfo(args({ appointmentDate: '2020-01-01' })).error,
      '預約時間必須在未來',
    );
  });

  await t.test('缺聯絡人', () => {
    assert.equal(
      appointment.buildAppointmentInfo(args({ contactName: '  ' })).error,
      '請輸入聯絡人姓名',
    );
  });

  await t.test('手機格式錯誤', () => {
    assert.equal(
      appointment.buildAppointmentInfo(args({ contactPhone: '123' })).error,
      '請輸入有效的手機號（+853／+86）',
    );
  });

  await t.test('描述超過 500 字', () => {
    assert.match(
      appointment.buildAppointmentInfo(args({ description: '字'.repeat(501) })).error,
      /500/,
    );
  });

  await t.test('附件超過 9 個或格式錯誤', () => {
    assert.match(
      appointment.buildAppointmentInfo(args({ mediaUrls: Array.from({ length: 10 }, (_, i) => `f-${i}`) })).error,
      /最多 9/,
    );
    assert.equal(
      appointment.buildAppointmentInfo(args({ mediaUrls: ['ok', ''] })).error,
      '附件格式不正確',
    );
  });
});
