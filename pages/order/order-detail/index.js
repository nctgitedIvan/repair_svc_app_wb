import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchOrderDetail } from '../../../services/api/index';

const FEE_LABEL = {
  SERVICE_FEE: '服務費',
  MATERIAL_FEE: '材料費',
};

/**
 * 訂單詳情（P7a，接 `services/api.fetchOrderDetail`）。
 *
 * ⚠️ 這一頁原本是電商版（`services/order/orderDetail` + model mock），
 *    已改寫為新 API；不要讓它再引用舊服務。
 */
Page({
  data: {
    loading: true,
    error: false,
    order: null,
    items: [],
    createdAtText: '',
    appointmentText: '',
  },

  onLoad(query) {
    this.orderNo = (query && (query.orderNo || query.orderId)) || '';
    this.load();
  },

  async load() {
    if (!this.orderNo) {
      this.setData({ loading: false, error: true });
      return;
    }

    this.setData({ loading: true, error: false });
    try {
      const order = await fetchOrderDetail(this.orderNo);
      this.setData({
        loading: false,
        error: false,
        order,
        items: (order.items || []).map((item) => ({
          ...item,
          feeLabel: FEE_LABEL[item.feeType] || '',
        })),
        createdAtText: formatTime(order.createdAt),
        appointmentText: formatTime(order.appointmentAt),
      });
    } catch (err) {
      console.warn('[order-detail] 載入失敗', err);
      this.setData({ loading: false, error: true });
      Toast({ context: this, selector: '#t-toast', message: '訂單載入失敗，請稍後再試', icon: '' });
    }
  },

  onRetry() {
    this.load();
  },
});

function formatTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';
}
