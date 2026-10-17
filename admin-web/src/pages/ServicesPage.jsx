import { useCallback, useEffect, useState } from 'react';
import { Button, Image, Space, Switch, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import client from '../api/client';
import ServiceModal from './ServiceModal';
import { formatMoney } from '../utils/format';

export default function ServicesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    client
      .get('/services')
      .then(({ data }) => setList(data.list || []))
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入服務失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (record) => {
    try {
      await client.patch(`/services/${record.serviceId}/status`, { isActive: !record.isActive });
      message.success(record.isActive ? '已下架' : '已上架');
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '更新狀態失敗');
    }
  };

  const columns = [
    {
      title: '服務',
      key: 'service',
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
      dataIndex: 'priceCents',
      key: 'price',
      width: 120,
      render: (cents) => <span className="money">{formatMoney(cents)}</span>,
    },
    {
      title: '時長',
      dataIndex: 'durationMinutes',
      key: 'duration',
      width: 100,
      render: (minutes) => `${minutes} 分鐘`,
    },
    {
      title: '技能標籤',
      key: 'skillTags',
      render: (_, record) => (
        <Space size={4} wrap>
          {(record.skillTags || []).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
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
          <h2>服務管理</h2>
          <div className="page-subtitle">價格、時長、上下架（Mock 資料，寫入記憶體）</div>
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
            新增服務
          </Button>
        </Space>
      </div>

      <Table
        rowKey="serviceId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <ServiceModal
        open={modalOpen}
        service={editing}
        onCancel={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
