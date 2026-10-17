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
    appointmentInfo: null,
    appointmentMediaItems: [],
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
      const appointmentInfo = order.appointmentInfo || null;
      const mediaUrls = appointmentInfo && Array.isArray(appointmentInfo.mediaUrls)
        ? appointmentInfo.mediaUrls
        : [];

      this.setData({
        loading: false,
        error: false,
        order,
        items: (order.items || []).map((item) => ({
          ...item,
          feeLabel: FEE_LABEL[item.feeType] || '',
        })),
        createdAtText: formatTime(order.createdAt),
        appointmentText: formatTime(
          appointmentInfo ? appointmentInfo.appointmentAt : order.appointmentAt,
        ),
        appointmentInfo,
        appointmentMediaItems: mediaUrls.map((url, index) => {
          if (url.startsWith('audio:')) {
            const seconds = Number(url.slice(6)) || 0;
            return {
              key: `audio-${index}`,
              type: 'audio',
              label: seconds > 0 ? `語音 ${seconds}″` : '語音附件',
            };
          }
          return { key: `image-${index}`, type: 'image', src: url };
        }),
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

  onPreviewMedia(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.appointmentMediaItems[index];
    if (!item) return;

    if (item.type === 'image' && item.src) {
      wx.previewImage({ urls: [item.src], current: item.src });
      return;
    }

    Toast({ context: this, selector: '#t-toast', message: '語音附件將於 P5 支援播放', icon: '' });
  },
});

function formatTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';
}
