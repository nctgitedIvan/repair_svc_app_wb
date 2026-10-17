import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import client from '../api/client';

export default function CategoriesPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    client
      .get('/categories')
      .then(({ data }) => setList(data.list || []))
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入分類失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parentOptions = useMemo(
    () =>
      list
        .filter((category) => !category.parentId && (!editing || category.categoryId !== editing.categoryId))
        .map((category) => ({ value: category.categoryId, label: category.name })),
    [list, editing],
  );

  const openModal = (category = null) => {
    setEditing(category);
    setModalOpen(true);
    if (category) {
      form.setFieldsValue({
        name: category.name,
        parentId: category.parentId || undefined,
        order: category.order || 0,
        isActive: category.isActive !== false,
      });
    } else {
      form.setFieldsValue({ name: '', parentId: undefined, order: 0, isActive: true });
    }
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      parentId: values.parentId || null,
      order: Number(values.order) || 0,
      isActive: values.isActive !== false,
    };
    try {
      if (editing) {
        await client.put(`/categories/${editing.categoryId}`, payload);
        message.success('分類已更新');
      } else {
        await client.post('/categories', payload);
        message.success('分類已新增');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '儲存失敗');
    }
  };

  const toggleStatus = async (record) => {
    try {
      await client.patch(`/categories/${record.categoryId}/status`, { isActive: !record.isActive });
      message.success(record.isActive ? '已停用' : '已啟用');
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '更新狀態失敗');
    }
  };

  const nameOf = (categoryId) => {
    const category = list.find((entry) => entry.categoryId === categoryId);
    return category ? category.name : '—';
  };

  const columns = [
    { title: '分類名稱', dataIndex: 'name', key: 'name' },
    {
      title: '層級',
      key: 'level',
      width: 110,
      render: (_, record) => (record.parentId ? <Tag color="blue">二級</Tag> : <Tag color="gold">一級</Tag>),
    },
    {
      title: '上層分類',
      dataIndex: 'parentId',
      key: 'parentId',
      render: (parentId) => (parentId ? nameOf(parentId) : '—'),
    },
    { title: '排序', dataIndex: 'order', key: 'order', width: 90 },
    {
      title: '狀態',
      key: 'status',
      width: 110,
      render: (_, record) => (
        <Switch
          checked={record.isActive !== false}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => toggleStatus(record)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Button type="link" onClick={() => openModal(record)}>
          編輯
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>分類管理</h2>
          <div className="page-subtitle">兩層分類（一級側邊欄／二級 tabs）；停用不刪除</div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            重新整理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            新增分類
          </Button>
        </Space>
      </div>

      <Table
        rowKey="categoryId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <Modal
        title={editing ? '編輯分類' : '新增分類'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="儲存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分類名稱" rules={[{ required: true, message: '請輸入分類名稱' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="上層分類（留空＝一級）">
            <Select allowClear options={parentOptions} placeholder="一級分類" />
          </Form.Item>
          <Form.Item name="order" label="排序">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="啟用" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
