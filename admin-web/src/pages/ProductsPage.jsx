import { useCallback, useEffect, useState } from 'react';
import { Button, Image, Space, Switch, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import client from '../api/client';
import ProductModal from './ProductModal';
import { formatMoney } from '../utils/format';

export default function ProductsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    client
      .get('/products')
      .then(({ data }) => setList(data.list || []))
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入商品失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (record) => {
    try {
      await client.patch(`/products/${record.productId}/status`, { isActive: !record.isActive });
      message.success(record.isActive ? '已下架' : '已上架');
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '更新狀態失敗');
    }
  };

  const columns = [
    {
      title: '商品',
      key: 'product',
      render: (_, record) => (
        <Space>
          {record.images && record.images[0] ? (
            <Image src={record.images[0]} width={56} height={56} className="product-thumb" preview={false} />
          ) : (
            <div className="product-thumb" />
          )}
          <div>
            <div>{record.name}</div>
            <div className="text-muted">{record.nameEn || '—'}</div>
          </div>
        </Space>
      ),
    },
    { title: '分類', dataIndex: 'category', key: 'category', width: 100 },
    {
      title: '價格',
      key: 'price',
      width: 140,
      render: (_, record) => {
        const price =
          record.skus && record.skus.length > 0
            ? Math.min(...record.skus.map((sku) => sku.priceCents))
            : record.priceCents;
        return (
          <span className="money">
            {formatMoney(price)}
            {record.skus && record.skus.length > 0 ? ' 起' : ''}
          </span>
        );
      },
    },
    {
      title: '庫存',
      key: 'stock',
      width: 100,
      render: (_, record) =>
        record.skus && record.skus.length > 0
          ? record.skus.reduce((sum, sku) => sum + (sku.stock || 0), 0)
          : record.stock,
    },
    {
      title: '規格／SKU',
      key: 'specs',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tag>{record.specs ? record.specs.length : 0} 維度</Tag>
          <Tag color="blue">{record.skus ? record.skus.length : 0} SKU</Tag>
        </Space>
      ),
    },
    {
      title: '狀態',
      key: 'status',
      width: 110,
      render: (_, record) => (
        <Switch
          checked={record.isActive !== false}
          checkedChildren="上架"
          unCheckedChildren="下架"
          onChange={() => toggleStatus(record)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => {
            setEditing(record);
            setModalOpen(true);
          }}
        >
          編輯
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>商品管理</h2>
          <div className="page-subtitle">價格、上下架、規格與 SKU（Mock 資料，寫入記憶體）</div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            重新整理
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新增商品
          </Button>
        </Space>
      </div>

      <Table
        rowKey="productId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <ProductModal
        open={modalOpen}
        product={editing}
        onCancel={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
