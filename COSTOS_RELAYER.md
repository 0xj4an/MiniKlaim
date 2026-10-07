# Análisis de Costos del Relayer - MiniKlaim

## 🔍 MODELO DE COSTOS

### 1️⃣ USUARIOS PAGAN (Flujo Principal - Mayoría)

**Celo CIP-64 Fee Abstraction:**
- Usuarios pagan gas en **USDT/USDC/USDm** (stablecoins)
- MiniPay wallets tienen USDT, **NO necesitan CELO nativo**
- La app intenta en orden: USDT → USDC → USDm
- **Costo para ti: $0 ✅**

**Cómo funciona:**
1. Usuario completa un run
2. App verifica balances de stablecoins
3. Usa el primer stablecoin con balance suficiente como `feeCurrency`
4. Usuario firma y paga ~$0.001-0.01 en USDT
5. **El relayer NO gasta nada**

---

### 2️⃣ RELAYER SPONSOREA (Fallback - Minoría)

El relayer **PAGA** cuando:
- ❌ Usuario no tiene suficiente stablecoin
- ❌ Usuario rechaza firmar la transacción
- ❌ Transacción del usuario falla (RPC error, out of gas)
- ❌ Usuario no tiene wallet conectado
- ❌ Primera vez del usuario (wallet vacía)

**Endpoints de sponsor:**
- `POST /api/runs/{id}/sponsor-mint` - Hexes
- `POST /api/users/{address}/badges/sponsor-mint` - Badges

**Costo estimado por transacción:**
- Hexes: ~0.01-0.03 CELO (~$0.01-0.03)
- Badges: ~0.005-0.015 CELO (~$0.005-0.015)

---

## 💰 BALANCE Y GASTOS ACTUALES

### Balance Relayer
- **Address:** `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`
- **Balance actual:** `0.001968 CELO` (~$0.002)
- **Estado:** 🔴 **CRÍTICO - CASI VACÍO**

### Estimación de Gastos HOY (Oct 7, 2026)

Con base en:
- **20,666 hexes** claimed
- **1,001 runs** completados
- **874 jugadores** únicos

**Escenario conservador (50% sponsoreado):**
- ~500 transacciones sponsoreadas
- Costo: 500 × 0.02 CELO = **10 CELO gastados**
- En USD: **~$10/día**

**Escenario optimista (20% sponsoreado):**
- ~200 transacciones sponsoreadas  
- Costo: 200 × 0.02 CELO = **4 CELO gastados**
- En USD: **~$4/día**

**Balance inicial estimado:**
- Si gastó ~5-10 CELO hoy
- Balance inicial: 5.002 - 10.002 CELO
- Balance actual: 0.002 CELO
- **Gastado hoy: ~5-10 CELO** 💸

---

## 📊 PROYECCIONES

### Diarias
- **Costo promedio:** 5-10 CELO/día
- **En USD:** $5-10/día
- **Dependiente de:** % de usuarios con stablecoins

### Mensuales
- **Si continúa al mismo ritmo:** 150-300 CELO/mes
- **En USD:** $150-300/mes
- **Nota:** Debería REDUCIRSE conforme usuarios reciban rewards en USDT

### Optimizaciones Posibles
1. **Educar usuarios:** Asegurar que tengan USDT en wallet
2. **Airdrops iniciales:** Dar USDT a nuevos usuarios
3. **Rewards en USDT:** Los usuarios ganan y acumulan stablecoins
4. **Rate limiting:** Limitar sponsors por usuario/día
5. **Threshold:** Solo sponsorear runs > X hexes

---

## 🚨 ACCIÓN INMEDIATA REQUERIDA

### Balance Crítico
- ⚠️  **0.002 CELO restante** - puede agotarse en minutos
- 🔴 **Transferir 20-50 CELO AHORA**
- ⏰ **Sin balance, la app deja de funcionar para usuarios nuevos**

### Recarga Recomendada
```
To: 0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83
Amount: 20-50 CELO
From: Tu wallet con CELO
Network: Celo Mainnet
```

### Monitoreo Futuro
- ⚠️  Alerta cuando balance < 5 CELO
- 🔔 Notificación cuando balance < 2 CELO
- 📊 Dashboard con gasto diario/semanal
- 💡 Considerar auto-recarga con Gelato o similar

---

## 🔗 RECURSOS

- [Relayer en Celoscan](https://celoscan.io/address/0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83)
- [Hexes Contract](https://celoscan.io/address/0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B)
- [Celo Fee Currencies (CIP-64)](https://docs.celo.org/protocol/transaction/erc20-transaction-fees)

---

## 💡 POR QUÉ LA GENTE NO PAGA

### Razones Principales:
1. **Usuarios nuevos:** Primera vez, wallet vacía
2. **No tienen USDT:** MiniPay puede tener otras coins pero no USDT
3. **Bugs de wallet:** MiniPay a veces no muestra el fee currency picker
4. **Usuarios rechazan:** No entienden por qué firmar
5. **Balance insuficiente:** Tienen $0.001 USDT, necesitan $0.01

### Soluciones:
- ✅ **Rewards system:** Ya implementado - usuarios ganan USDT
- 🎯 **Onboarding:** Dar 0.1 USDT a nuevos usuarios
- 📱 **UI mejorada:** Explicar mejor el pago de gas
- 🔄 **Auto-conversion:** Permitir pagar con cualquier token
- 💰 **Batching:** Agrupar múltiples claims en una tx

---

## 📈 MÉTRICAS A TRACKEAR

Para optimizar costos, monitorear:
- **% de txs sponsoreadas vs pagadas por usuario**
- **Costo promedio por tx sponsoreada**
- **Balance del relayer en tiempo real**
- **Tasa de rechazo de usuarios** (cuántos rechazan firmar)
- **Distribución de balances de usuarios** (cuántos tienen USDT)

Objetivo: **Reducir % sponsoreado de 50% → 10%**
