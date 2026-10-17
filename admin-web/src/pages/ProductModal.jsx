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
import SkuEditor from '../components/SkuEditor';
import { centsToYuan, yuanToCents } from '../utils/format';

const EMPTY_FORM = {
  name: '',
  nameEn: '',
  category: '',
  priceYuan: '0.00',
  stock: 0,
  isActive: true,
  description: '',
  detailHtml: '',
};

export default function ProductModal({ open, product, onCancel, onSaved }) {
  const [form] = Form.useForm();
  const [specs, setSpecs] = useState([]);
  const [skus, setSkus] = useState([]);
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (product) {
      form.setFieldsValue({
        name: product.name,
        nameEn: product.nameEn || '',
        category: product.category || '',
        priceYuan: centsToYuan(product.priceCents),
        stock: product.stock || 0,
        isActive: product.isActive !== false,
        description: product.description || '',
        detailHtml: product.detailHtml || '',
      });
      setSpecs(
        (product.specs || []).map((spec, index) => ({
          specId: spec.specId || `spec-${index + 1}`,
          title: spec.title || '規格',
          values: (spec.values || []).join(','),
        })),
      );
      setSkus(
        (product.skus || []).map((sku) => ({
          skuId: sku.skuId,
          specValues: sku.specValues || [],
          priceYuan: centsToYuan(sku.priceCents),
          stock: sku.stock || 0,
          image: sku.image || '',
        })),
      );
      setImages(product.images || []);
    } else {
      form.setFieldsValue(EMPTY_FORM);
      setSpecs([]);
      setSkus([]);
      setImages([]);
    }
  }, [open, product, form]);

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
    const normalizedSpecs = specs.map((spec, index) => ({
      specId: spec.specId || `spec-${index + 1}`,
      title: spec.title || '規格',
      values: String(spec.values || '')
        .split(/[,，]/)
        .map((value) => value.trim())
        .filter(Boolean),
    }));

    if (normalizedSpecs.length > 0 && skus.length === 0) {
      message.error('有規格時至少要建立一個 SKU');
      return;
    }

    const payload = {
      name: values.name,
      nameEn: values.nameEn || '',
      category: values.category || '',
      priceCents: yuanToCents(values.priceYuan),
      stock: Number(values.stock) || 0,
      isActive: values.isActive !== false,
      description: values.description || '',
      detailHtml: values.detailHtml || '',
      images,
      specs: normalizedSpecs,
      skus: skus.map((sku, index) => ({
        skuId: sku.skuId || `sku-${index + 1}`,
        specValues: sku.specValues || [],
        priceCents: yuanToCents(sku.priceYuan),
        stock: Number(sku.stock) || 0,
        image: sku.image || images[0] || '',
      })),
    };

    setSaving(true);
    try {
      if (product) {
        await client.put(`/products/${product.productId}`, payload);
        message.success('商品已更新');
      } else {
        await client.post('/products', payload);
        message.success('商品已新增');
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
      title={product ? '編輯商品' : '新增商品'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={saving}
      okText="儲存"
      cancelText="取消"
      width={860}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="商品名稱" rules={[{ required: true, message: '請輸入商品名稱' }]}>
              <Input placeholder="例：冷媒 R410" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="nameEn" label="英文名稱">
              <Input placeholder="Refrigerant R410" />
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
            <Form.Item name="priceYuan" label="展示價（元）" rules={[{ required: true, message: '請輸入價格' }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="stock" label="商品層庫存（無規格時使用）">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="description" label="簡短描述">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="商品圖片">
              <Space align="start">
                {images.length > 0 && <Image src={images[0]} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 8 }} />}
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  customRequest={({ file }) => uploadImage(file)}
                >
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
          <Input.TextArea rows={4} placeholder="<p>詳情介紹…</p>" />
        </Form.Item>
      </Form>

      <SkuEditor
        specs={specs}
        setSpecs={setSpecs}
        skus={skus}
        setSkus={setSkus}
        defaultPriceYuan={form.getFieldValue('priceYuan') || '0.00'}
      />
    </Modal>
  );
}
