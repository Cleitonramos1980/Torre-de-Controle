import { a as e, w as c, X as d, a2 as g, bw as p } from "./index-Cw1PFMX8.js";

const n = "/recebiveis-cartao";

function i(a = {}) {
  const o = new URLSearchParams();
  Object.entries(a).forEach(([$, u]) => {
    if (u == null || u === "") return;
    o.set($, String(u));
  });
  const t = o.toString();
  return t ? `?${t}` : "";
}

function r(a = {}) {
  return {
    status: a.status,
    criticidade: a.criticidade,
    responsavel: a.responsavel,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
    filial: a.filial,
    operadora: a.operadora,
    bandeira: a.bandeira,
    modalidade: a.modalidade,
    nsu: a.nsu,
    autorizacao: a.autorizacao,
    vendaNumero: a.vendaNumero,
    cliente: a.cliente,
    contextoDia: a.contextoDia,
    contextoFilial: a.contextoFilial,
    drillOperadora: a.drillOperadora,
    drillBandeira: a.drillBandeira,
  };
}

function s(a = {}) {
  return {
    merchantId: a.merchantId,
    openingDate: a.openingDate,
    page: a.page,
    size: a.size,
    processNumber: a.processNumber,
    chargebackId: a.chargebackId,
    transactionDate: a.transactionDate,
    uniqueSequentialNumber: a.uniqueSequentialNumber,
    paymentTypeCode: a.paymentTypeCode,
  };
}

async function h() {
  return e(`${n}/visao-geral`);
}
async function f() {
  return e(`${n}/filtros`);
}
async function l(a) {
  return c(`${n}/acompanhamento-caixa/snapshot`, a);
}
async function y(a, o) {
  return e(`${n}/acompanhamento-caixa/dashboard${i({ dataMovimento: a, codfilial: o })}`);
}
async function resumoFechamentoCaixa(a, o) {
  if (typeof a === "object" && a !== null) {
    return e(
      `${n}/acompanhamento-caixa/resumo-fechamento${i({
        dataMovimento: a.dataMovimento,
        dataInicio: a.dataInicio,
        dataFim: a.dataFim,
        codfilial: a.codfilial,
        tipoResumo: a.tipoResumo,
      })}`,
    );
  }
  return e(`${n}/acompanhamento-caixa/resumo-fechamento${i({ dataMovimento: a, codfilial: o, tipoResumo: "FECHADO" })}`);
}
async function v(a = {}) {
  return e(
    `${n}/acompanhamento-caixa/caixas${i({
      dataMovimento: a.dataMovimento,
      codfilial: a.codfilial,
      status: a.status,
      risco: a.risco,
      page: a.page,
      pageSize: a.pageSize,
    })}`,
  );
}
async function b(a) {
  return e(`${n}/acompanhamento-caixa/caixas/${a}`);
}
async function x(a) {
  return c(`${n}/acompanhamento-caixa/caixas/${a}/iniciar-auditoria`, {});
}
async function C(a, o) {
  return c(`${n}/acompanhamento-caixa/caixas/${a}/finalizar-auditoria`, o);
}
async function R(a, o) {
  return c(`${n}/acompanhamento-caixa/caixas/${a}/acertos`, o);
}
async function D(a) {
  return e(`${n}/acompanhamento-caixa/caixas/${a}/comparar-snapshot-winthor`);
}
async function w(a) {
  return e(`${n}/acompanhamento-caixa/caixas/${a}/pacote-auditoria`);
}
async function k(a = {}) {
  return e(
    `${n}/conciliacao${i({
      filial: a.filial,
      data: a.data,
      valorMin: a.valorMin,
      valorMax: a.valorMax,
      status: a.status,
      risco: a.risco,
      operadora: a.operadora,
    })}`,
  );
}
async function F(a) {
  return e(`${n}/conciliacao/${a}`);
}
async function z(a) {
  return c(`${n}/conciliacao/${a}/explicar`, {});
}
async function I(a, o) {
  return d(`${n}/conciliacao/${a}/conciliar-manual`, o);
}
async function P(a = {}) {
  return e(`${n}/divergencias/resumo${i(r(a))}`);
}
async function S(a = {}) {
  return e(`${n}/divergencias/comparativo-dia${i(r(a))}`);
}
async function W(a = {}, o) {
  return e(`${n}/divergencias/comparativo-filial${i({ ...r(a), ordenacao: o })}`);
}
async function A(a = {}) {
  return e(`${n}/divergencias/drilldown${i(r(a))}`);
}
async function M(a = {}, o, t) {
  return e(`${n}/divergencias/transacoes${i({ ...r(a), page: o, pageSize: t })}`);
}
async function N(a) {
  return e(`${n}/divergencias/transacoes/${a}`);
}
async function T(a = {}) {
  return e(`${n}/divergencias/validacao-rede${i(r(a))}`);
}
async function q(a, o = 2) {
  return e(`${n}/divergencias/transacoes/${a}/validacao-rede${i({ janelaDias: o })}`);
}
async function O(a = {}) {
  return e(`${n}/confronto/dashboard${i(r(a))}`);
}
async function B(a = {}) {
  return e(`${n}/confronto/rede-para-winthor/dia${i(r(a))}`);
}
async function E(a = {}) {
  return e(`${n}/confronto/rede-para-winthor/filial${i(r(a))}`);
}
async function L(a = {}, o, t) {
  return e(`${n}/confronto/rede-para-winthor/transacoes${i({ ...r(a), page: o, pageSize: t })}`);
}
async function V(a = {}) {
  return e(`${n}/confronto/winthor-para-rede/dia${i(r(a))}`);
}
async function G(a = {}) {
  return e(`${n}/confronto/winthor-para-rede/filial${i(r(a))}`);
}
async function H(a = {}, o, t) {
  return e(`${n}/confronto/winthor-para-rede/transacoes${i({ ...r(a), page: o, pageSize: t })}`);
}
async function j() {
  return e(`${n}/dossies`);
}
async function Q(a) {
  return e(`${n}/dossies/${a}`);
}
async function U(a) {
  return c(`${n}/dossies/${a}/gerar-email`, {});
}
async function X(a) {
  return c(`${n}/dossies/${a}/gerar-contestacao`, {});
}
async function J(a) {
  return c(`${n}/dossies/${a}/gerar-ticket`, {});
}
async function K() {
  return e(`${n}/winthor/conexao`);
}
async function Y() {
  return c(`${n}/winthor/sincronizar`, {});
}
async function Z() {
  return e(`${n}/winthor/titulos`);
}
async function _() {
  return e(`${n}/rede/status`);
}
async function aa() {
  return c(`${n}/rede/sincronizar`, {});
}
async function na() {
  return e(`${n}/rede/indicadores`);
}
async function ea(a = {}) {
  return e(`${n}/chargeback/resumo${i(s(a))}`);
}
async function oa(a = {}) {
  return e(`${n}/chargeback/notificacoes${i(s(a))}`);
}
async function ia(a = {}) {
  return e(`${n}/chargeback/solicitacoes${i(s(a))}`);
}
async function ra(a = {}) {
  return e(`${n}/chargeback/historico${i(s(a))}`);
}
async function ca(a = {}) {
  return e(`${n}/chargeback/historico/processo${i(s(a))}`);
}
async function ta(a) {
  return c(`${n}/ia-financeira/perguntar`, a, { timeoutMs: 6e4 });
}
async function sa(a) {
  const o = new FormData();
  o.append("file", a);
  return g(`${n}/importacoes/upload`, o, { timeoutMs: 3e5, retry: 0 });
}
async function ua() {
  return e(`${n}/importacoes`);
}
async function da(a) {
  return p(`${n}/importacoes/${a}`);
}
async function $a(a, o) {
  return c(`${n}/relatorios/exportar/${a.toLowerCase()}`, o);
}
async function ga() {
  return e(`${n}/configuracoes`);
}
async function pa(a) {
  return d(`${n}/configuracoes`, a);
}

async function ba(a = {}) {
  return e(
    `${n}/conciliado-cartao/filial-estabelecimentos${i({
      adquirente: a.adquirente,
      ativo: a.ativo,
    })}`,
  );
}
async function ha(a) {
  return c(`${n}/conciliado-cartao/filial-estabelecimentos`, a);
}
async function fa(a, o) {
  return d(`${n}/conciliado-cartao/filial-estabelecimentos/${a}`, o);
}
async function la(a) {
  return c(`${n}/conciliado-cartao/filial-estabelecimentos/${a}/inativar`, {});
}
async function ya(a) {
  return c(`${n}/conciliado-cartao/filial-estabelecimentos/${a}/ativar`, {});
}
async function va(a, o) {
  const t = new FormData();
  t.append("maquininhaFile", a);
  if (o) t.append("cnpjFile", o);
  return g(`${n}/conciliado-cartao/filial-estabelecimentos/import`, t, {
    timeoutMs: 3e5,
    retry: 0,
  });
}

export {
  M as A,
  N as B,
  T as C,
  q as D,
  j as E,
  Q as F,
  U as G,
  X as H,
  J as I,
  K as J,
  Z as K,
  Y as L,
  _ as M,
  na as N,
  aa as O,
  ea as P,
  oa as Q,
  ia as R,
  ra as S,
  ca as T,
  ua as U,
  sa as V,
  da as W,
  ta as X,
  $a as Y,
  ga as Z,
  pa as _,
  f as a,
  k as b,
  I as c,
  F as d,
  z as e,
  b as f,
  h as g,
  y as h,
  resumoFechamentoCaixa as acompanhamentoCaixaResumoFechamento,
  v as i,
  w as j,
  l as k,
  x as l,
  C as m,
  D as n,
  O as o,
  B as p,
  E as q,
  L as r,
  R as s,
  V as t,
  G as u,
  H as v,
  P as w,
  S as x,
  W as y,
  A as z,
  ba as listFilialEstabelecimentos,
  ha as createFilialEstabelecimento,
  fa as updateFilialEstabelecimento,
  la as inativarFilialEstabelecimento,
  ya as ativarFilialEstabelecimento,
  va as importFilialEstabelecimentos,
};
