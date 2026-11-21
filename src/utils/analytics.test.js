import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPaymentsPipeline, ownerPaymentScope } from '../controllers/analytics.controller.js';

function getPath(doc, path) {
  return path.split('.').reduce((o, k) => (o == null ? null : o[k]), doc);
}

function evalExpr(expr, doc) {
  if (typeof expr === 'string') return expr.startsWith('$') ? getPath(doc, expr.slice(1)) : expr;
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr == null) return expr;
  if (expr instanceof Date) return expr;
  if (Array.isArray(expr)) return expr.map((e) => evalExpr(e, doc));
  const [op, arg] = Object.entries(expr)[0];
  if (op === '$divide') {
    const [a, b] = evalExpr(arg, doc);
    return a / b;
  }
  if (op === '$gte') {
    const [a, b] = evalExpr(arg, doc);
    return a >= b;
  }
  if (op === '$cond') {
    const [c, t, f] = arg;
    return evalExpr(c, doc) ? evalExpr(t, doc) : evalExpr(f, doc);
  }
  if (op === '$dateToString') {
    const d = new Date(evalExpr(arg.date, doc));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  throw new Error(`unsupported expr ${op}`);
}

function matchDoc(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matchDoc(doc, sub));
    const value = getPath(doc, key);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, operand]) => {
        if (op === '$lte') return value <= operand;
        if (op === '$gte') return value >= operand;
        if (op === '$gt') return value > operand;
        if (op === '$in') return operand.includes(value);
        throw new Error(`unsupported op ${op}`);
      });
    }
    return value === cond;
  });
}

function runStages(rows, stages, db) {
  let out = rows;
  for (const stage of stages) {
    const [op, arg] = Object.entries(stage)[0];
    if (op === '$match') {
      out = out.filter((d) => matchDoc(d, arg));
    } else if (op === '$lookup') {
      out = out.map((d) => ({
        ...d,
        [arg.as]: db[arg.from].filter((r) => String(r[arg.foreignField]) === String(d[arg.localField])),
      }));
    } else if (op === '$unwind') {
      const path = arg.startsWith('$') ? arg.slice(1) : arg;
      out = out.flatMap((d) => (Array.isArray(d[path]) && d[path].length > 0
        ? d[path].map((v) => ({ ...d, [path]: v }))
        : []));
    } else if (op === '$group') {
      const groups = new Map();
      for (const d of out) {
        const key = arg._id === null ? 'null' : evalExpr(arg._id, d);
        if (!groups.has(key)) groups.set(key, { _id: arg._id === null ? null : key });
        const g = groups.get(key);
        for (const [field, acc] of Object.entries(arg)) {
          if (field === '_id') continue;
          const [aop, aarg] = Object.entries(acc)[0];
          if (aop !== '$sum') throw new Error(`unsupported acc ${aop}`);
          g[field] = (g[field] || 0) + evalExpr(aarg, d);
        }
      }
      out = [...groups.values()];
    } else if (op === '$facet') {
      const res = {};
      for (const [name, sub] of Object.entries(arg)) res[name] = runStages(out, sub, db);
      out = [res];
    } else if (op === '$count') {
      out = [{ [arg]: out.length }];
    } else {
      throw new Error(`unsupported stage ${op}`);
    }
  }
  return out;
}

function fakeDb({ payments, bookings }) {
  const db = { payments, bookings };
  return {
    collection: (name) => ({
      aggregate: (pipeline) => ({ toArray: async () => runStages(db[name], pipeline, db) }),
    }),
  };
}

const nov = new Date('2026-11-05T12:00:00.000Z');

test('minor-unit amounts convert to whole BDT', async () => {
  const db = fakeDb({
    payments: [
      { _id: 'p1', amount: 1850000, status: 'paid', createdAt: nov },
      { _id: 'p2', amount: 740000, status: 'paid', createdAt: nov },
      { _id: 'p3', amount: 99900, status: 'refunded', createdAt: nov },
    ],
    bookings: [],
  });
  const rows = await db.collection('payments')
    .aggregate(monthlyPaymentsPipeline([{ $match: { status: 'paid' } }], 'revenue'))
    .toArray();
  assert.deepEqual(rows, [{ _id: '2026-11', revenue: 25900 }]);
});

test('month bucketing splits on the UTC month boundary', async () => {
  const db = fakeDb({
    payments: [
      { _id: 'p1', amount: 100000, status: 'paid', createdAt: new Date('2026-10-31T23:59:59.000Z') },
      { _id: 'p2', amount: 200000, status: 'paid', createdAt: new Date('2026-11-01T00:00:00.000Z') },
    ],
    bookings: [],
  });
  const rows = await db.collection('payments')
    .aggregate(monthlyPaymentsPipeline(
      [{ $match: { status: 'paid', createdAt: { $gte: new Date('2026-10-01T00:00:00.000Z') } } }],
      'revenue'
    ))
    .toArray();
  rows.sort((a, b) => (a._id < b._id ? -1 : 1));
  assert.deepEqual(rows, [
    { _id: '2026-10', revenue: 1000 },
    { _id: '2026-11', revenue: 2000 },
  ]);
});

test('owner scoping excludes another owner payment', async () => {
  const db = fakeDb({
    bookings: [
      { _id: 'b1', owner: { id: 'o1' } },
      { _id: 'b2', owner: { id: 'o2' } },
    ],
    payments: [
      { _id: 'p1', bookingId: 'b1', amount: 100000, status: 'paid', createdAt: nov },
      { _id: 'p2', bookingId: 'b2', amount: 200000, status: 'paid', createdAt: nov },
    ],
  });
  const rows = await db.collection('payments')
    .aggregate(monthlyPaymentsPipeline(
      [{ $match: { status: 'paid' } }, ...ownerPaymentScope('o1')],
      'earnings'
    ))
    .toArray();
  assert.deepEqual(rows, [{ _id: '2026-11', earnings: 1000 }]);
});
