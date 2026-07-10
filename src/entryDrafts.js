// src/entryDrafts.js
// A reusable, account-agnostic snapshot of a transaction or transfer, and the
// inverse: a fresh entry instantiated from a draft. Pure — no React, no storage.
// instantiate* emit exactly the shapes TransactionEditor.save()/TransferEditor.save()
// emit, so callers route them through the existing App save handlers.
import { nanoid } from 'nanoid';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Stored splits → draft splits: strip per-line id/transferId; tag each line kind.
// A transfer line keeps its target account id (looked up in splitTargets) as targetId.
function draftSplits(splits, splitTargets) {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  const targets = splitTargets instanceof Map ? splitTargets : new Map(Object.entries(splitTargets || {}));
  return splits.map(l => {
    const base = { amount: l.amount, description: l.description || '' };
    if (l.transferId) return { ...base, kind: 'transfer', targetId: targets.get(l.id) || null };
    return { ...base, kind: 'category', categoryId: l.categoryId || null, subId: l.subId || null };
  });
}

// Draft splits → concrete split lines (fresh ids) + a splitTargets Map. A transfer
// line whose target was lost degrades to a category line using fallbackCategoryId.
function buildSplits(draftLines, fallbackCategoryId) {
  if (!Array.isArray(draftLines) || draftLines.length === 0) return { splits: null, splitTargets: null };
  const splitTargets = new Map();
  const splits = draftLines.map(l => {
    const id = nanoid(8);
    const base = { id, amount: l.amount, description: l.description || '' };
    if (l.kind === 'transfer' && l.targetId) {
      splitTargets.set(id, l.targetId);
      return { ...base, transferId: `tr_${id}` };
    }
    const categoryId = l.categoryId || fallbackCategoryId || null;
    return { ...base, categoryId, ...(l.subId ? { subId: l.subId } : {}) };
  });
  return { splits, splitTargets: splitTargets.size ? splitTargets : null };
}

export function makeTransactionDraft(f, splitTargets = new Map()) {
  return { kind: 'transaction', payload: {
    description: f.description || '',
    amount: f.amount,
    categoryId: f.categoryId || null,
    subId: f.subId || null,
    payeeId: f.payeeId || null,
    checkNumber: f.checkNumber || null,
    splits: draftSplits(f.splits, splitTargets),
  } };
}

export function draftFromTransaction(txn, splitTargets = new Map()) {
  return makeTransactionDraft(txn, splitTargets);
}

export function instantiateTransaction(draft, { account, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, date = todayISO(), fallbackCategoryId = null, payeesById = null } = {}) {
  const p = draft.payload;
  const isBank = layoutFor(account.type, typesById) === 'bank';
  const { splits, splitTargets } = buildSplits(p.splits, fallbackCategoryId);
  const amount = splits ? splits.reduce((s, l) => s + l.amount, 0) : p.amount;
  return {
    accountId: account.id,
    date,
    amount,
    categoryId: p.categoryId || null,
    subId: p.subId || null,
    description: p.description || '',
    payeeId: isBank && p.payeeId && (!payeesById || payeesById.has(p.payeeId)) ? p.payeeId : null,
    checkNumber: isBank ? (p.checkNumber || null) : null,
    splits: splits || null,
    ...(splitTargets ? { splitTargets } : {}),
  };
}

export function makeTransferDraft(f, splitTargets = new Map()) {
  return { kind: 'transfer', payload: {
    fromId: f.fromId,
    toId: f.toId,
    amount: Math.abs(f.amount),
    categoryId: f.categoryId || null,
    description: f.description || '',
    splits: draftSplits(f.splits, splitTargets),
  } };
}

export function draftFromTransfer(pair, splitTargets = new Map()) {
  return makeTransferDraft({
    fromId: pair.fromLeg.accountId,
    toId: pair.toLeg.accountId,
    amount: Math.abs(pair.fromLeg.amount),
    categoryId: pair.fromLeg.categoryId,
    description: pair.fromLeg.description,
    splits: pair.fromLeg.splits,
  }, splitTargets);
}

export function instantiateTransfer(draft, { date = todayISO(), fallbackCategoryId = null } = {}) {
  const p = draft.payload;
  const { splits, splitTargets } = buildSplits(p.splits, fallbackCategoryId);
  return {
    fromId: p.fromId,
    toId: p.toId,
    amount: p.amount,
    date,
    description: p.description || '',
    categoryId: p.categoryId || null,
    ...(splits ? { splits, splitTargets: splitTargets || new Map() } : {}),
  };
}

export function labelFor(draft, payeesById = null) {
  const p = (draft && draft.payload) || {};
  if (draft && draft.kind === 'transfer') return p.description || 'Transfer';
  const payeeName = payeesById && p.payeeId ? (payeesById.get(p.payeeId)?.name || '') : '';
  return payeeName || p.description || 'Transaction';
}
