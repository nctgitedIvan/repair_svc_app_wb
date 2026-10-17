'use strict';

/**
 * InMemoryCustomerRepository —— CustomerRepository 的測試替身。
 */
class InMemoryCustomerRepository {
  #customers = new Map();

  async findById(customerId) {
    assertId(customerId);
    const customer = this.#customers.get(customerId);
    return customer ? clone(customer) : null;
  }

  async findByUserId(userId) {
    assertId(userId);
    for (const customer of this.#customers.values()) {
      if (customer.userId === userId) return clone(customer);
    }
    return null;
  }

  async save(customer) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('Customer.save(customer) 需要物件');
    }
    assertId(customer.customerId);
    assertId(customer.userId);

    this.#customers.set(customer.customerId, {
      customerId: customer.customerId,
      userId: customer.userId,
      name: customer.name || '',
      phone: customer.phone || '',
      addresses: Array.isArray(customer.addresses) ? clone(customer.addresses) : [],
      defaultAddressId: customer.defaultAddressId || null,
      createdAt: Number.isInteger(customer.createdAt) ? customer.createdAt : null,
      updatedAt: Number.isInteger(customer.updatedAt) ? customer.updatedAt : null,
    });
  }

  size() {
    return this.#customers.size;
  }
}

function assertId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Customer 識別碼必須是非空字串');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryCustomerRepository };
