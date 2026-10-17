import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Checkbox, Col, Modal, Row, Space, Table, Tag, Typography, message } from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import client from '../api/client';

const GROUP_LABELS = {
  'admin.full': '超級管理員（全部權限）',
  'admin.finance': '財務',
  'admin.operations': '營運',
  'admin.support': '客服支援',
};

export default function PermissionsPage() {
  const [groups, setGroups] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([client.get('/permission-groups'), client.get('/admin-accounts')])
      .then(([groupResponse, accountResponse]) => {
        setGroups(groupResponse.data.groups || {});
        setAccounts(accountResponse.data.list || []);
      })
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入權限資料失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (account) => {
    setEditing(account);
    setSelectedGroups(account.permissionGroups || []);
  };

  const save = async () => {
    if (selectedGroups.length === 0) {
      message.warning('至少要選擇一個權限組');
      return;
    }
    setSaving(true);
    try {
      await client.patch(`/admin-accounts/${editing.id}/permissions`, {
        permissionGroups: selectedGroups,
      });
      message.success('權限組已更新（Mock）');
      setEditing(null);
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: '管理員', key: 'name', render: (_, record) => `${record.name}（${record.username}）` },
    {
      title: '權限組',
      key: 'groups',
      render: (_, record) => (
        <Space size={4} wrap>
          {(record.permissionGroups || []).map((group) => (
            <Tag key={group} color="blue">
              {GROUP_LABELS[group] || group}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <Tag color={status === 'active' ? 'green' : 'default'}>{status}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Button type="link" onClick={() => openEdit(record)}>
          編輯權限
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>權限管理</h2>
          <div className="page-subtitle">RBAC 權限組（Mock）；2FA／HttpOnly Cookie 為正式版預留</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          重新整理
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {Object.entries(groups).map(([key, permissions]) => (
          <Col xs={24} lg={12} key={key}>
            <Card
              size="small"
              title={
                <Space>
                  <SafetyCertificateOutlined />
                  {GROUP_LABELS[key] || key}
                </Space>
              }
              loading={loading}
            >
              <Space size={[4, 8]} wrap>
                {permissions.map((permission) => (
                  <Tag key={permission}>{permission}</Tag>
                ))}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="管理員帳號">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={accounts}
          pagination={false}
        />
      </Card>

      <Modal
        title="編輯管理員權限組"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={save}
        confirmLoading={saving}
        okText="儲存"
        cancelText="取消"
      >
        <Typography.Paragraph type="secondary">
          權限組只是 RBAC 的「能力範圍」；單筆資料的歸屬、狀態、金額等 ABAC 限制仍由後端 AccessPolicy 決定。
        </Typography.Paragraph>
        <Checkbox.Group
          value={selectedGroups}
          onChange={setSelectedGroups}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          options={Object.keys(groups).map((key) => ({
            value: key,
            label: GROUP_LABELS[key] || key,
          }))}
        />
      </Modal>
    </div>
  );
}
