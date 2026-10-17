import { useEffect, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Switch,
  Upload,
  message,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import client from '../api/client';
import { centsToYuan, yuanToCents } from '../utils/format';

const EMPTY_FORM = {
  name: '',
  nameEn: '',
  category: '',
  priceYuan: '0.00',
  durationMinutes: 60,
  skillTags: '',
  isActive: true,
  description: '',
  detailHtml: '',
};

export default function ServiceModal({ open, service, onCancel, onSaved }) {
  const [form] = Form.useForm();
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (service) {
      form.setFieldsValue({
        name: service.name,
        nameEn: service.nameEn || '',
        category: service.category || '',
        priceYuan: centsToYuan(service.priceCents),
        durationMinutes: service.durationMinutes || 60,
        skillTags: (service.skillTags || []).join(','),
        isActive: service.isActive !== false,
        description: service.description || '',
        detailHtml: service.detailHtml || '',
      });
      setImages(service.images || []);
    } else {
      form.setFieldsValue(EMPTY_FORM);
      setImages([]);
    }
  }, [open, service, form]);

  const uploadImage = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try {
        const { data } = await client.post('/uploads', {
          dataUrl: reader.result,
          fileName: file.name,
        });
        setImages([data.url]);
        message.success('圖片已上傳（模擬）');
      } catch (err) {
        message.error((err.response && err.response.data && err.response.data.message) || '圖片上傳失敗');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onOk = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      nameEn: values.nameEn || '',
      category: values.category || '',
      priceCents: yuanToCents(values.priceYuan),
      durationMinutes: Number(values.durationMinutes) || 0,
      skillTags: String(values.skillTags || '')
        .split(/[,，]/)
        .map((value) => value.trim())
        .filter(Boolean),
      isActive: values.isActive !== false,
      description: values.description || '',
      detailHtml: values.detailHtml || '',
      images,
    };

    setSaving(true);
    try {
      if (service) {
        await client.put(`/services/${service.serviceId}`, payload);
        message.success('服務已更新');
      } else {
        await client.post('/services', payload);
        message.success('服務已新增');
      }
      onSaved();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={service ? '編輯服務' : '新增服務'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={saving}
      okText="儲存"
      cancelText="取消"
      width={720}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="服務名稱" rules={[{ required: true, message: '請輸入服務名稱' }]}>
              <Input placeholder="例：冷氣維修" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="nameEn" label="英文名稱">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="category" label="一級分類">
              <Input placeholder="空調／水／電／家具" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="priceYuan" label="價格（元）" rules={[{ required: true, message: '請輸入價格' }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="durationMinutes" label="時長（分鐘）">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="skillTags" label="技能標籤（逗號分隔）">
          <Input placeholder="空調,冷凍空調" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="description" label="簡短描述">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服務圖片">
              <Space align="start">
                {images.length > 0 && <Image src={images[0]} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 8 }} />}
                <Upload accept="image/*" showUploadList={false} customRequest={({ file }) => uploadImage(file)}>
                  <Button icon={<UploadOutlined />} loading={uploading}>
                    上傳圖片
                  </Button>
                </Upload>
              </Space>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="isActive" label="上架" valuePropName="checked">
          <Switch checkedChildren="上架" unCheckedChildren="下架" />
        </Form.Item>

        <Form.Item name="detailHtml" label="詳情 HTML（富文本）">
          <Input.TextArea rows={4} placeholder="<p>服務詳情…</p>" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
