import { Button, Input, InputNumber, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';

function splitValues(text) {
  return String(text || '')
    .split(/[,，]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function cartesian(lists) {
  if (lists.length === 0) return [];
  return lists.reduce(
    (acc, list) => acc.flatMap((prefix) => list.map((value) => [...prefix, value])),
    [[]],
  );
}

/**
 * 規格與 SKU 編輯器。
 *
 * - 規格（specs）：維度 + 以逗號分隔的值
 * - SKU：可由「依規格產生」自動建立組合，再逐一改價格／庫存
 */
export default function SkuEditor({ specs, setSpecs, skus, setSkus, defaultPriceYuan = '0' }) {
  const updateSpec = (index, patch) => {
    setSpecs(specs.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)));
  };

  const addSpec = () => {
    setSpecs([...specs, { specId: `spec-${specs.length + 1}`, title: '規格', values: '' }]);
  };

  const removeSpec = (index) => {
    setSpecs(specs.filter((_, i) => i !== index));
  };

  const generateSkus = () => {
    const dimensions = specs
      .map((spec) => splitValues(spec.values))
      .filter((values) => values.length > 0);
    const combos = cartesian(dimensions);
    if (combos.length === 0) return;

    const existing = new Map(
      skus.map((sku) => [sku.specValues.join('|'), sku]),
    );

    setSkus(
      combos.map((combo, index) => {
        const key = combo.join('|');
        const previous = existing.get(key);
        return {
          skuId: previous ? previous.skuId : `sku-${index + 1}`,
          specValues: combo,
          priceYuan: previous ? previous.priceYuan : defaultPriceYuan,
          stock: previous ? previous.stock : 0,
          image: previous ? previous.image : '',
        };
      }),
    );
  };

  const updateSku = (index, patch) => {
    setSkus(skus.map((sku, i) => (i === index ? { ...sku, ...patch } : sku)));
  };

  const removeSku = (index) => {
    setSkus(skus.filter((_, i) => i !== index));
  };

  const columns = [
    {
      title: 'SKU',
      dataIndex: 'skuId',
      key: 'skuId',
      width: 120,
      render: (value) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '規格組合',
      dataIndex: 'specValues',
      key: 'specValues',
      render: (values) => (
        <Space size={4} wrap>
          {values.map((value) => (
            <Tag key={value}>{value}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '價格（元）',
      key: 'priceYuan',
      width: 130,
      render: (_, record, index) => (
        <InputNumber
          min={0}
          precision={2}
          value={Number(record.priceYuan)}
          onChange={(value) => updateSku(index, { priceYuan: value === null ? '0' : String(value) })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '庫存',
      key: 'stock',
      width: 110,
      render: (_, record, index) => (
        <InputNumber
          min={0}
          precision={0}
          value={Number(record.stock)}
          onChange={(value) => updateSku(index, { stock: value === null ? 0 : value })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record, index) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeSku(index)}
        />
      ),
    },
  ];

  return (
    <div className="sku-editor">
      <div className="sku-editor-title">
        <span>規格定義</span>
        <Button size="small" icon={<PlusOutlined />} onClick={addSpec}>
          新增規格維度
        </Button>
      </div>

      {specs.length === 0 ? (
        <Typography.Text type="secondary">無規格商品（直接使用商品價格與庫存）</Typography.Text>
      ) : (
        specs.map((spec, index) => (
          <div className="sku-row" key={spec.specId || index}>
            <Input
              placeholder="維度名稱（例：規格）"
              value={spec.title}
              onChange={(event) => updateSpec(index, { title: event.target.value })}
            />
            <Input
              placeholder="值，以逗號分隔（例：標準罐,大罐）"
              value={spec.values}
              onChange={(event) => updateSpec(index, { values: event.target.value })}
            />
            <span className="text-muted">{splitValues(spec.values).length} 個值</span>
            <span />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeSpec(index)} />
          </div>
        ))
      )}

      <div className="sku-editor-title" style={{ marginTop: 16 }}>
        <span>SKU 組合</span>
        <Space>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={generateSkus} disabled={specs.length === 0}>
            依規格產生 SKU
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setSkus([
                ...skus,
                {
                  skuId: `sku-${skus.length + 1}`,
                  specValues: [],
                  priceYuan: defaultPriceYuan,
                  stock: 0,
                  image: '',
                },
              ])
            }
          >
            手動新增
          </Button>
        </Space>
      </div>

      <Table
        rowKey="skuId"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={skus}
        locale={{ emptyText: '尚未建立 SKU（有規格時必填）' }}
      />
    </div>
  );
}
