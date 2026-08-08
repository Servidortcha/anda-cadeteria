import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Package, Users, DollarSign, BarChart3, Plus, X, Check,
  Clock, Truck, Trash2, MapPin, Phone, ChevronRight, Route as RouteIcon,
  Ban, Pencil, MessageCircle, Send, Bell, MoreHorizontal,
  ShoppingCart, User, History, LogOut, ChevronDown, Minus
} from "lucide-react";
import { supabase } from "./supabaseClient";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
`;

const COLORS = {
  bg: "#241713",
  panel: "#2E1E19",
  panel2: "#39251F",
  line: "#4A322A",
  text: "#EDEDE9",
  muted: "#A0897F",
  accent: "#FF6B4A",
  accentYellow: "#FFC94A",
  accentDim: "#5C2E20",
  blue: "#4A9EDB",
  green: "#4CAF7D",
  red: "#E14E42",
  grey: "#7A6862",
};

const ESTADOS = [
  { id: "pendiente", label: "PENDIENTE", color: COLORS.accentYellow, icon: Clock },
  { id: "asignado", label: "ASIGNADO", color: COLORS.accent, icon: Package },
  { id: "en_camino", label: "EN CAMINO", color: COLORS.blue, icon: Truck },
  { id: "entregado", label: "ENTREGADO", color: COLORS.green, icon: Check },
  { id: "cancelado", label: "CANCELADO", color: COLORS.grey, icon: Ban },
];

const nextEstado = { pendiente: "asignado", asignado: "en_camino", en_camino: "entregado" };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const money = (n) => `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// --- Roles de acceso (Supabase Auth) ---
// "anon" = sin sesión · "cliente" = cuenta creada en la app · "admin" / "cadete" = rol en user_metadata
const detectarRol = (user) => {
  if (!user) return "anon";
  const rol = user.user_metadata?.rol;
  return rol === "admin" || rol === "cadete" ? rol : "cliente";
};
// El email de login de cada cadete se deriva de su id (determinístico, no expuesto al público)
const emailCadete = (id) => `c.${id}@anda.cadete`;
const cadeteIdDeSesion = (user) => user?.user_metadata?.cadete_id || null;

const VAPID_PUBLIC_KEY = "BCqWyhedYPGNs1ZJ01ugWe0FMTsunTpFLuqPEeC4TJpuE17N8Eg-7EvXuuRObG39OnqqExJq33n1Csv7ljqWhXg";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function suscribirPush(role, refId) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, motivo: "no_soportado" };
    if (Notification.permission === "denied") return { ok: false, motivo: "denegado" };
    const permiso = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permiso !== "granted") return { ok: false, motivo: "denegado" };

    const registro = await navigator.serviceWorker.ready;
    let sub = await registro.pushManager.getSubscription();
    if (!sub) {
      sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("push_subscriptions").upsert({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      role, ref_id: refId || null, user_id: user?.id || null,
    }, { onConflict: "endpoint" });
    return { ok: true };
  } catch (e) {
    console.error("Error suscribiendo push", e);
    return { ok: false, motivo: "error" };
  }
}

function BotonNotificaciones({ role, refId, style }) {
  const [estado, setEstado] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");

  const activar = async () => {
    const r = await suscribirPush(role, refId);
    setEstado(typeof Notification !== "undefined" ? Notification.permission : "default");
    if (!r.ok && r.motivo === "denegado") {
      alert("Los permisos de notificación están bloqueados. Activalos desde la configuración del navegador.");
    }
  };

  if (typeof Notification === "undefined") return null;
  if (estado === "granted") {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.green, fontFamily: "'Inter', sans-serif", fontSize: 11, ...style }}>
        <Bell size={12} /> Notificaciones activas
      </span>
    );
  }
  return (
    <button onClick={activar} style={{
      display: "flex", alignItems: "center", gap: 5, background: "transparent",
      border: `1px solid ${COLORS.accent}66`, color: COLORS.accent, borderRadius: 6,
      padding: "6px 10px", fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer", ...style,
    }}><Bell size={12} /> Activar notificaciones</button>
  );
}

// Dispara una notificación push a todos los dispositivos suscriptos de un rol (y referencia opcional)
async function notificar(rol, refId, title, body, url) {
  try {
    await supabase.functions.invoke("send-push", { body: { tipo: rol, refId: refId || null, title, body, url } });
  } catch (e) { console.error("No se pudo enviar la notificación", e); }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 780);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 780px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange); };
  }, []);
  return isMobile;
}

// --- Mapeo entre las columnas de Supabase (snake_case) y el modelo de la app (camelCase) ---
const rowToPedido = (r) => ({
  id: r.id, cliente: r.cliente, direccionRetiro: r.direccion_retiro, direccion: r.direccion,
  telefono: r.telefono, nota: r.nota, tarifaCliente: Number(r.tarifa_cliente), comisionCadete: Number(r.comision_cadete),
  subtotalProductos: Number(r.subtotal_productos || 0), tarifaEnvio: r.tarifa_envio != null ? Number(r.tarifa_envio) : null,
  localId: r.local_id,
  cadeteId: r.cadete_id, clienteId: r.cliente_id, estado: r.estado,
  ubicacion: r.ubicacion_lat != null ? { lat: r.ubicacion_lat, lng: r.ubicacion_lng, ts: new Date(r.ubicacion_ts).getTime() } : null,
  creadoEn: new Date(r.creado_en).getTime(), entregadoEn: r.entregado_en ? new Date(r.entregado_en).getTime() : null,
});
const pedidoToRow = (p) => ({
  id: p.id, cliente: p.cliente, direccion_retiro: p.direccionRetiro || null, direccion: p.direccion,
  telefono: p.telefono || null, nota: p.nota || null, tarifa_cliente: p.tarifaCliente, comision_cadete: p.comisionCadete,
  subtotal_productos: p.subtotalProductos || 0, tarifa_envio: p.tarifaEnvio ?? null, local_id: p.localId || null,
  cadete_id: p.cadeteId || null, cliente_id: p.clienteId || null, estado: p.estado,
  ubicacion_lat: p.ubicacion?.lat ?? null, ubicacion_lng: p.ubicacion?.lng ?? null,
  ubicacion_ts: p.ubicacion?.ts ? new Date(p.ubicacion.ts).toISOString() : null,
  entregado_en: p.entregadoEn ? new Date(p.entregadoEn).toISOString() : null,
});
const rowToCadete = (r) => ({ id: r.id, nombre: r.nombre, telefono: r.telefono, password: r.password, activo: r.activo });
const cadeteToRow = (c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono || null, password: c.password, activo: c.activo });
const rowToLocal = (r) => ({ id: r.id, nombre: r.nombre, direccion: r.direccion, categoria: r.categoria, imagenUrl: r.imagen_url, activo: r.activo, orden: r.orden });
const localToRow = (l) => ({ id: l.id, nombre: l.nombre, direccion: l.direccion, categoria: l.categoria || null, imagen_url: l.imagenUrl || null, activo: l.activo, orden: l.orden || 0 });
const rowToProducto = (r) => ({ id: r.id, localId: r.local_id, nombre: r.nombre, descripcion: r.descripcion, precio: Number(r.precio), imagenUrl: r.imagen_url, disponible: r.disponible, orden: r.orden });
const productoToRow = (p) => ({ id: p.id, local_id: p.localId, nombre: p.nombre, descripcion: p.descripcion || null, precio: p.precio, imagen_url: p.imagenUrl || null, disponible: p.disponible, orden: p.orden || 0 });
const rowToItem = (r) => ({ id: r.id, pedidoId: r.pedido_id, productoId: r.producto_id, nombre: r.nombre, precio: Number(r.precio), cantidad: r.cantidad });
const rowToConfig = (r) => ({ tarifaDefault: Number(r.tarifa_default), comisionDefault: Number(r.comision_default), adminPassword: r.admin_password });
const rowToMensaje = (r) => ({ id: r.id, pedidoId: r.pedido_id, remitente: r.remitente, texto: r.texto, creadoEn: new Date(r.creado_en).getTime() });
const configToRow = (c) => ({ tarifa_default: c.tarifaDefault, comision_default: c.comisionDefault, admin_password: c.adminPassword });

// Sincroniza un array completo (nuevo estado deseado) contra Supabase, calculando altas/bajas/cambios
async function syncTabla(table, prevList, nextList, toRow) {
  const prevMap = new Map(prevList.map((x) => [x.id, x]));
  const nextMap = new Map(nextList.map((x) => [x.id, x]));
  const nuevos = nextList.filter((x) => !prevMap.has(x.id));
  const cambiados = nextList.filter((x) => prevMap.has(x.id) && JSON.stringify(prevMap.get(x.id)) !== JSON.stringify(x));
  const borrados = prevList.filter((x) => !nextMap.has(x.id));

  if (nuevos.length) await supabase.from(table).insert(nuevos.map(toRow));
  for (const item of cambiados) await supabase.from(table).update(toRow(item)).eq("id", item.id);
  for (const item of borrados) await supabase.from(table).delete().eq("id", item.id);
}

function useStorage() {
  const [pedidos, setPedidos] = useState([]);
  const [cadetes, setCadetes] = useState([]);
  const [locales, setLocales] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedidoItems, setPedidoItems] = useState([]);
  const [config, setConfig] = useState({ tarifaDefault: 1500, comisionDefault: 800, adminPassword: "" });
  const [loaded, setLoaded] = useState(false);
  const [rol, setRol] = useState("anon");
  const [sessionUser, setSessionUser] = useState(null);
  const pedidosRef = useRef([]);
  const cadetesRef = useRef([]);
  const localesRef = useRef([]);
  const productosRef = useRef([]);
  useEffect(() => { pedidosRef.current = pedidos; }, [pedidos]);
  useEffect(() => { cadetesRef.current = cadetes; }, [cadetes]);
  useEffect(() => { localesRef.current = locales; }, [locales]);
  useEffect(() => { productosRef.current = productos; }, [productos]);

  // Observa la sesión de Supabase Auth: cada cambio de rol recarga los datos que le corresponden
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user || null;
      setSessionUser(u);
      setRol(detectarRol(u));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      const u = s?.user || null;
      setSessionUser(u);
      setRol(detectarRol(u));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchPedidos = useCallback(async () => {
    if (rol === "anon") return;
    let q = supabase.from("pedidos").select("*").order("creado_en", { ascending: false });
    if (rol === "cliente" && sessionUser) q = q.eq("cliente_id", sessionUser.id);
    const { data, error } = await q;
    if (!error && data) setPedidos(data.map(rowToPedido));
  }, [rol, sessionUser]);
  const fetchCadetes = useCallback(async () => {
    // Anónimos y clientes solo ven el listado público (id, nombre) de cadetes activos
    const tabla = rol === "admin" ? "cadetes" : "cadetes_publico";
    const { data, error } = await supabase.from(tabla).select("*").order("nombre");
    if (!error && data) setCadetes(data.map(rowToCadete));
  }, [rol]);
  const fetchLocales = useCallback(async () => {
    const { data, error } = await supabase.from("locales").select("*").order("orden");
    if (!error && data) setLocales(data.map(rowToLocal));
  }, []);
  const fetchProductos = useCallback(async () => {
    const { data, error } = await supabase.from("productos").select("*").order("orden");
    if (!error && data) setProductos(data.map(rowToProducto));
  }, []);
  const fetchPedidoItems = useCallback(async () => {
    if (rol === "anon") return;
    const { data, error } = await supabase.from("pedido_items").select("*");
    if (!error && data) setPedidoItems(data.map(rowToItem));
  }, [rol]);
  const fetchConfig = useCallback(async () => {
    if (rol === "admin") {
      const { data, error } = await supabase.from("config").select("*").eq("id", 1).single();
      if (!error && data) setConfig(rowToConfig(data));
    } else {
      // El resto solo lee tarifas públicas, nunca la contraseña de admin
      const { data, error } = await supabase.from("v_config_public").select("*").eq("id", 1).single();
      if (!error && data) setConfig({ tarifaDefault: Number(data.tarifa_default), comisionDefault: Number(data.comision_default), adminPassword: "" });
    }
  }, [rol]);

  useEffect(() => {
    (async () => {
      setLoaded(false);
      await Promise.all([fetchPedidos(), fetchCadetes(), fetchLocales(), fetchProductos(), fetchPedidoItems(), fetchConfig()]);
      setLoaded(true);
    })();
  }, [fetchPedidos, fetchCadetes, fetchLocales, fetchProductos, fetchPedidoItems, fetchConfig, rol]);

  useEffect(() => {
    const channel = supabase
      .channel("cadeteria-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, fetchPedidos)
      .on("postgres_changes", { event: "*", schema: "public", table: "cadetes" }, fetchCadetes)
      .on("postgres_changes", { event: "*", schema: "public", table: "locales" }, fetchLocales)
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, fetchProductos)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, fetchPedidoItems)
      .on("postgres_changes", { event: "*", schema: "public", table: "config" }, fetchConfig)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidos, fetchCadetes, fetchLocales, fetchProductos, fetchPedidoItems, fetchConfig]);

  const savePedidos = useCallback(async (next) => {
    const prev = pedidosRef.current;
    setPedidos(next);
    try { await syncTabla("pedidos", prev, next, pedidoToRow); }
    catch (e) { console.error("Error guardando pedidos", e); }
  }, []);

  const saveCadetes = useCallback(async (next) => {
    const prev = cadetesRef.current;
    setCadetes(next);
    try { await syncTabla("cadetes", prev, next, cadeteToRow); }
    catch (e) { console.error("Error guardando cadetes", e); }
  }, []);

  const saveLocales = useCallback(async (next) => {
    const prev = localesRef.current;
    setLocales(next);
    try { await syncTabla("locales", prev, next, localToRow); }
    catch (e) { console.error("Error guardando locales", e); }
  }, []);

  const saveProductos = useCallback(async (next) => {
    const prev = productosRef.current;
    setProductos(next);
    try { await syncTabla("productos", prev, next, productoToRow); }
    catch (e) { console.error("Error guardando productos", e); }
  }, []);

  const saveConfig = useCallback(async (next) => {
    setConfig(next);
    try { await supabase.from("config").update(configToRow(next)).eq("id", 1); }
    catch (e) { console.error("Error guardando config", e); }
  }, []);

  // Crea un pedido con su carrito de items en un solo paso (checkout del cliente)
  const crearPedidoConCarrito = useCallback(async (pedido, items) => {
    setPedidos([pedido, ...pedidosRef.current]);
    const itemsConId = items.map((it) => ({ ...it, id: uid(), pedidoId: pedido.id }));
    setPedidoItems((prev) => [...prev, ...itemsConId]);
    try {
      await supabase.from("pedidos").insert(pedidoToRow(pedido));
      if (itemsConId.length) {
        await supabase.from("pedido_items").insert(itemsConId.map((it) => ({
          id: it.id, pedido_id: pedido.id, producto_id: it.productoId || null, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad,
        })));
      }
    } catch (e) { console.error("Error creando pedido con carrito", e); }
  }, []);

  // Actualización puntual de un pedido (cadete: tomar / avanzar / GPS) sin pisar el resto
  const actualizarPedido = useCallback(async (id, cambios) => {
    const row = {};
    if ("estado" in cambios) row.estado = cambios.estado;
    if ("entregadoEn" in cambios) row.entregado_en = cambios.entregadoEn ? new Date(cambios.entregadoEn).toISOString() : null;
    if ("cadeteId" in cambios) row.cadete_id = cambios.cadeteId || null;
    if ("ubicacion" in cambios) {
      row.ubicacion_lat = cambios.ubicacion?.lat ?? null;
      row.ubicacion_lng = cambios.ubicacion?.lng ?? null;
      row.ubicacion_ts = cambios.ubicacion?.ts ? new Date(cambios.ubicacion.ts).toISOString() : null;
    }
    if ("tarifaCliente" in cambios) row.tarifa_cliente = cambios.tarifaCliente;
    if ("tarifaEnvio" in cambios) row.tarifa_envio = cambios.tarifaEnvio ?? null;
    setPedidos((prev) => prev.map((p) => p.id === id ? { ...p, ...cambios } : p));
    try { await supabase.from("pedidos").update(row).eq("id", id); }
    catch (e) { console.error("Error actualizando pedido", e); }
  }, []);

  // Alta directa de un pedido del cliente (sin reescribir el resto del listado)
  const crearPedidoDirecto = useCallback(async (pedido) => {
    setPedidos([pedido, ...pedidosRef.current]);
    try { await supabase.from("pedidos").insert(pedidoToRow(pedido)); }
    catch (e) { console.error("Error creando pedido", e); }
  }, []);

  return {
    pedidos, savePedidos, cadetes, saveCadetes, locales, saveLocales,
    productos, saveProductos, pedidoItems, crearPedidoConCarrito, crearPedidoDirecto,
    config, saveConfig, actualizarPedido, rol, sessionUser, loaded,
  };
}

function Badge({ estado }) {
  const e = ESTADOS.find((x) => x.id === estado) || ESTADOS[0];
  const Icon = e.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 11,
      letterSpacing: "0.06em", color: e.color, border: `1px solid ${e.color}55`,
      background: `${e.color}1A`, borderRadius: 4, padding: "4px 8px",
    }}>
      <Icon size={12} strokeWidth={2.5} /> {e.label}
    </span>
  );
}

function Sidebar({ tab, setTab, counts }) {
  const isMobile = useIsMobile();
  const items = [
    { id: "pedidos", label: "Pedidos", icon: Package, count: counts.activos },
    { id: "cadetes", label: "Cadetes", icon: Users, count: counts.cadetesActivos },
    { id: "locales", label: "Locales", icon: MapPin },
    { id: "productos", label: "Productos", icon: Package },
    { id: "cobros", label: "Cobros", icon: DollarSign },
    { id: "reportes", label: "Reportes", icon: BarChart3 },
  ];

  if (isMobile) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: COLORS.panel, borderTop: `1px solid ${COLORS.line}`,
        display: "flex", overflowX: "auto", paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button key={it.id} onClick={() => setTab(it.id)} style={{
              flex: "1 0 auto", minWidth: 68, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "9px 6px", background: "none", border: "none", cursor: "pointer", position: "relative",
              color: active ? COLORS.accent : COLORS.muted,
            }}>
              <Icon size={18} strokeWidth={2} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9.5, fontWeight: 600 }}>{it.label}</span>
              {typeof it.count === "number" && it.count > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 12, background: COLORS.accent, color: "#16181B",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                  borderRadius: 8, padding: "0 4px", minWidth: 14, textAlign: "center",
                }}>{it.count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      width: 220, background: COLORS.panel, borderRight: `1px solid ${COLORS.line}`,
      display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh",
    }}>
      <div style={{ padding: "24px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 6, background: COLORS.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <RouteIcon size={17} color="#16181B" strokeWidth={2.5} />
          </div>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 19,
            letterSpacing: "0.03em", color: COLORS.text,
          }}>ANDÁ</div>
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 4, marginLeft: 2 }}>
          Panel de despacho
        </div>
      </div>
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button key={it.id} onClick={() => setTab(it.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 6, border: "none", cursor: "pointer", textAlign: "left",
              background: active ? COLORS.panel2 : "transparent",
              color: active ? COLORS.text : COLORS.muted,
              fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 14,
              borderLeft: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            }}>
              <Icon size={16} strokeWidth={2} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {typeof it.count === "number" && it.count > 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  background: COLORS.accentDim, color: COLORS.accent,
                  borderRadius: 10, padding: "1px 7px",
                }}>{it.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", padding: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.grey }}>
        {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "short" })}
      </div>
    </div>
  );
}

function NuevoPedido({ onCreate, cadetes, config, isMobile }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cliente: "", direccionRetiro: "", direccion: "", telefono: "", nota: "",
    tarifaCliente: config.tarifaDefault, comisionCadete: config.comisionDefault, cadeteId: "",
  });

  useEffect(() => {
    setForm((f) => ({ ...f, tarifaCliente: config.tarifaDefault, comisionCadete: config.comisionDefault }));
  }, [config]);

  const submit = () => {
    if (!form.cliente.trim() || !form.direccion.trim()) return;
    onCreate({
      id: uid(), cliente: form.cliente, direccionRetiro: form.direccionRetiro, direccion: form.direccion,
      telefono: form.telefono, nota: form.nota,
      tarifaCliente: Number(form.tarifaCliente) || 0, comisionCadete: Number(form.comisionCadete) || 0,
      cadeteId: form.cadeteId || null, estado: form.cadeteId ? "asignado" : "pendiente",
      creadoEn: Date.now(), entregadoEn: null,
    });
    setForm({ cliente: "", direccionRetiro: "", direccion: "", telefono: "", nota: "", tarifaCliente: config.tarifaDefault, comisionCadete: config.comisionDefault, cadeteId: "" });
    setOpen(false);
  };

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.line}`,
    borderRadius: 5, padding: "9px 10px", color: COLORS.text,
    fontFamily: "'Inter', sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const label = { fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 5, display: "block", fontWeight: 500 };
  const grid2 = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 };
  const grid3 = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: "flex", alignItems: "center", gap: 8, background: COLORS.accent,
        color: "#16181B", border: "none", borderRadius: 6, padding: "10px 16px",
        fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13,
        letterSpacing: "0.03em", cursor: "pointer",
      }}>
        <Plus size={16} strokeWidth={3} /> NUEVO PEDIDO
      </button>
    );
  }

  return (
    <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 18, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", color: COLORS.text }}>NUEVO PEDIDO</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
          <X size={18} />
        </button>
      </div>
      <div style={grid2}>
        <div>
          <label style={label}>Cliente</label>
          <input style={inputStyle} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label style={label}>Teléfono</label>
          <input style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Opcional" />
        </div>
      </div>
      <div style={grid2}>
        <div>
          <label style={label}>Dirección de retiro</label>
          <input style={inputStyle} value={form.direccionRetiro} onChange={(e) => setForm({ ...form, direccionRetiro: e.target.value })} placeholder="¿Dónde se retira?" />
        </div>
        <div>
          <label style={label}>Dirección de entrega</label>
          <input style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Calle y número" />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={label}>Nota (opcional)</label>
        <input style={inputStyle} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej: timbre roto, dejar en portería" />
      </div>
      <div style={grid3}>
        <div>
          <label style={label}>Tarifa cliente</label>
          <input type="number" style={inputStyle} value={form.tarifaCliente} onChange={(e) => setForm({ ...form, tarifaCliente: e.target.value })} />
        </div>
        <div>
          <label style={label}>Comisión cadete</label>
          <input type="number" style={inputStyle} value={form.comisionCadete} onChange={(e) => setForm({ ...form, comisionCadete: e.target.value })} />
        </div>
        <div>
          <label style={label}>Asignar a</label>
          <select style={inputStyle} value={form.cadeteId} onChange={(e) => setForm({ ...form, cadeteId: e.target.value })}>
            <option value="">Sin asignar</option>
            {cadetes.filter((c) => c.activo).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={submit} style={{
        background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
        padding: "9px 18px", fontFamily: "'Oswald', sans-serif", fontWeight: 600,
        fontSize: 13, letterSpacing: "0.03em", cursor: "pointer",
      }}>CREAR PEDIDO</button>
    </div>
  );
}

function PedidoCard({ pedido, cadetes, items, onAdvance, onCancel, onAssign, onDelete, onSetTotal }) {
  const cadete = cadetes.find((c) => c.id === pedido.cadeteId);
  const canAdvance = nextEstado[pedido.estado];
  const misItems = items ? items.filter((it) => it.pedidoId === pedido.id) : [];
  const [editando, setEditando] = useState(false);
  const [totalInput, setTotalInput] = useState(pedido.tarifaCliente);
  const [verChat, setVerChat] = useState(false);

  const guardarTotal = () => {
    const nuevo = Number(totalInput) || 0;
    const envio = pedido.subtotalProductos ? nuevo - pedido.subtotalProductos : pedido.tarifaEnvio;
    onSetTotal(pedido.id, nuevo, envio);
    setEditando(false);
  };

  return (
    <div style={{
      background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 7,
      padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.text }}>{pedido.cliente}</div>
          {pedido.direccionRetiro && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, color: COLORS.muted, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              <MapPin size={12} color={COLORS.accent} /> Retiro: {pedido.direccionRetiro}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, color: COLORS.muted, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
            <MapPin size={12} color={COLORS.green} /> Entrega: {pedido.direccion}
          </div>
          {pedido.telefono && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, color: COLORS.muted, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              <Phone size={12} /> {pedido.telefono}
            </div>
          )}
          {pedido.nota && (
            <div style={{ marginTop: 6, color: COLORS.accent, fontSize: 12, fontFamily: "'Inter', sans-serif", fontStyle: "italic" }}>
              "{pedido.nota}"
            </div>
          )}
        </div>
        <Badge estado={pedido.estado} />
      </div>

      {misItems.length > 0 && (
        <div style={{ background: COLORS.bg, borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
          {misItems.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 2 }}>
              <span>{it.cantidad}x {it.nombre}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(it.precio * it.cantidad)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
        {editando ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>Total:</span>
            <input
              type="number" autoFocus value={totalInput} onChange={(e) => setTotalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardarTotal()}
              style={{ width: 80, background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 4, color: COLORS.text, padding: "3px 6px", fontFamily: "'JetBrains Mono', monospace" }}
            />
            <button onClick={guardarTotal} style={{ background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600 }}>OK</button>
          </div>
        ) : (
          <span onClick={() => { setTotalInput(pedido.tarifaCliente); setEditando(true); }} style={{ cursor: "pointer" }}>
            {pedido.subtotalProductos > 0 ? `Productos ${money(pedido.subtotalProductos)} · ` : ""}
            Total {money(pedido.tarifaCliente)} · Comisión {money(pedido.comisionCadete)} <Pencil size={11} style={{ verticalAlign: "middle", marginLeft: 2 }} />
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={pedido.cadeteId || ""}
          onChange={(e) => onAssign(pedido.id, e.target.value)}
          style={{
            background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 5,
            color: COLORS.text, fontFamily: "'Inter', sans-serif", fontSize: 12,
            padding: "6px 8px", flex: 1, minWidth: 120,
          }}
        >
          <option value="">Sin asignar</option>
          {cadetes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        {canAdvance && pedido.estado !== "cancelado" && (
          <button onClick={() => onAdvance(pedido.id)} style={{
            display: "flex", alignItems: "center", gap: 5, background: "transparent",
            border: `1px solid ${COLORS.green}55`, color: COLORS.green, borderRadius: 5,
            padding: "6px 10px", fontFamily: "'Inter', sans-serif", fontSize: 12,
            fontWeight: 600, cursor: "pointer",
          }}>
            {ESTADOS.find(e => e.id === nextEstado[pedido.estado]).label} <ChevronRight size={13} />
          </button>
        )}
        {pedido.estado !== "cancelado" && pedido.estado !== "entregado" && (
          <button onClick={() => onCancel(pedido.id)} style={{
            background: "transparent", border: `1px solid ${COLORS.red}55`, color: COLORS.red,
            borderRadius: 5, padding: "6px 9px", cursor: "pointer",
          }}><Ban size={13} /></button>
        )}
        <button onClick={() => onDelete(pedido.id)} style={{
          background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.grey,
          borderRadius: 5, padding: "6px 9px", cursor: "pointer",
        }}><Trash2 size={13} /></button>
        {pedido.cadeteId && (
          <button onClick={() => setVerChat((v) => !v)} style={{
            background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.muted,
            borderRadius: 5, padding: "6px 9px", cursor: "pointer",
          }}><MessageCircle size={13} /></button>
        )}
      </div>
      {verChat && <div style={{ marginTop: 10 }}><ChatPedido pedidoId={pedido.id} soloLectura /></div>}
    </div>
  );
}

function TabPedidos({ pedidos, cadetes, config, savePedidos, pedidoItems, isMobile }) {
  const create = (p) => {
    savePedidos([p, ...pedidos]);
    if (p.cadeteId) notificar("cadete", p.cadeteId, "Nuevo pedido asignado", `${p.cliente} — ${p.direccion}`, "/");
  };
  const advance = (id) => {
    savePedidos(pedidos.map((p) => p.id === id ? { ...p, estado: nextEstado[p.estado], entregadoEn: nextEstado[p.estado] === "entregado" ? Date.now() : p.entregadoEn } : p));
    const p = pedidos.find((x) => x.id === id);
    if (p?.clienteId) {
      const sig = nextEstado[p.estado];
      if (sig === "en_camino") notificar("cliente", p.clienteId, "Tu cadete está en camino", `Tu pedido a ${p.direccion} está en camino.`, "/");
      if (sig === "entregado") notificar("cliente", p.clienteId, "Pedido entregado", `Tu pedido a ${p.direccion} fue entregado.`, "/");
    }
  };
  const cancel = (id) => savePedidos(pedidos.map((p) => p.id === id ? { ...p, estado: "cancelado" } : p));
  const assign = (id, cadeteId) => {
    savePedidos(pedidos.map((p) => p.id === id ? { ...p, cadeteId: cadeteId || null, estado: p.estado === "pendiente" && cadeteId ? "asignado" : p.estado } : p));
    if (cadeteId) {
      const p = pedidos.find((x) => x.id === id);
      notificar("cadete", cadeteId, "Nuevo pedido asignado", `${p?.cliente || "Cliente"} — ${p?.direccion || ""}`, "/");
    }
  };
  const del = (id) => savePedidos(pedidos.filter((p) => p.id !== id));
  const setTotal = (id, nuevoTotal, envio) => savePedidos(pedidos.map((p) => p.id === id ? { ...p, tarifaCliente: nuevoTotal, tarifaEnvio: envio } : p));

  const columnas = ["pendiente", "asignado", "en_camino", "entregado"];
  const activos = pedidos.filter((p) => p.estado !== "cancelado" && p.estado !== "entregado");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: isMobile ? 19 : 22, color: COLORS.text }}>PEDIDOS</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{activos.length} en curso</div>
        </div>
      </div>
      <NuevoPedido onCreate={create} cadetes={cadetes} config={config} isMobile={isMobile} />
      <div style={isMobile
        ? { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x mandatory", margin: "0 -14px", padding: "0 14px 8px" }
        : { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }
      }>
        {columnas.map((col) => {
          const e = ESTADOS.find((x) => x.id === col);
          const items = pedidos.filter((p) => p.estado === col).sort((a, b) => b.creadoEn - a.creadoEn);
          return (
            <div key={col} style={isMobile ? { flex: "0 0 86vw", scrollSnapAlign: "start" } : undefined}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12,
                letterSpacing: "0.05em", color: e.color, borderBottom: `2px solid ${e.color}55`, paddingBottom: 8,
              }}>
                {e.label} <span style={{ color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>({items.length})</span>
              </div>
              {items.length === 0 && (
                <div style={{ color: COLORS.grey, fontSize: 12, fontFamily: "'Inter', sans-serif", padding: "10px 0" }}>Sin pedidos</div>
              )}
              {items.map((p) => (
                <PedidoCard key={p.id} pedido={p} cadetes={cadetes} items={pedidoItems} onAdvance={advance} onCancel={cancel} onAssign={assign} onDelete={del} onSetTotal={setTotal} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabCadetes({ cadetes, saveCadetes, pedidos }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");

  const add = () => {
    if (!nombre.trim() || !password.trim()) return;
    saveCadetes([...cadetes, { id: uid(), nombre, telefono, password, activo: true }]);
    setNombre(""); setTelefono(""); setPassword("");
  };
  const toggle = (id) => saveCadetes(cadetes.map((c) => c.id === id ? { ...c, activo: !c.activo } : c));
  const del = (id) => saveCadetes(cadetes.filter((c) => c.id !== id));

  const inputStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 5,
    padding: "9px 10px", color: COLORS.text, fontFamily: "'Inter', sans-serif",
    fontSize: 13, outline: "none",
  };

  return (
    <div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 18 }}>CADETES</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="Nombre del cadete" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input style={{ ...inputStyle, width: 140 }} placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <input style={{ ...inputStyle, width: 140 }} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={add} style={{
          background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
          padding: "9px 16px", fontFamily: "'Oswald', sans-serif", fontWeight: 600,
          fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}><Plus size={15} /> AGREGAR</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {cadetes.map((c) => {
          const activos = pedidos.filter((p) => p.cadeteId === c.id && !["entregado", "cancelado"].includes(p.estado)).length;
          const entregados = pedidos.filter((p) => p.cadeteId === c.id && p.estado === "entregado").length;
          return (
            <div key={c.id} style={{
              background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16,
              opacity: c.activo ? 1 : 0.5,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: COLORS.text }}>{c.nombre}</div>
                  {c.telefono && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{c.telefono}</div>}
                </div>
                <button onClick={() => del(c.id)} style={{ background: "none", border: "none", color: COLORS.grey, cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.muted }}>
                <span>{activos} activos</span>
                <span>{entregados} entregados</span>
              </div>
              <button onClick={() => toggle(c.id)} style={{
                marginTop: 12, width: "100%", background: "transparent",
                border: `1px solid ${c.activo ? COLORS.green : COLORS.grey}66`,
                color: c.activo ? COLORS.green : COLORS.grey, borderRadius: 5,
                padding: "6px 0", fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>{c.activo ? "ACTIVO" : "INACTIVO"}</button>
            </div>
          );
        })}
        {cadetes.length === 0 && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Todavía no cargaste cadetes.</div>}
      </div>
    </div>
  );
}

function TabLocales({ locales, saveLocales }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ nombre: "", direccion: "", categoria: "", imagenUrl: "" });

  const add = () => {
    if (!form.nombre.trim() || !form.direccion.trim()) return;
    saveLocales([...locales, { id: uid(), ...form, activo: true, orden: locales.length }]);
    setForm({ nombre: "", direccion: "", categoria: "", imagenUrl: "" });
  };
  const toggle = (id) => saveLocales(locales.map((l) => l.id === id ? { ...l, activo: !l.activo } : l));
  const del = (id) => saveLocales(locales.filter((l) => l.id !== id));

  const inputStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 5,
    padding: "9px 10px", color: COLORS.text, fontFamily: "'Inter', sans-serif",
    fontSize: 13, outline: "none",
  };

  return (
    <div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>LOCALES</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>Aparecen como sugerencias al cliente cuando arma un pedido</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.4fr 0.8fr 1fr auto", gap: 10, marginBottom: 20 }}>
        <input style={inputStyle} placeholder="Nombre del local" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input style={inputStyle} placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        <input style={inputStyle} placeholder="Categoría" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
        <input style={inputStyle} placeholder="URL de imagen (opcional)" value={form.imagenUrl} onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })} />
        <button onClick={add} style={{
          background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
          padding: "9px 14px", fontFamily: "'Oswald', sans-serif", fontWeight: 600,
          fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}><Plus size={15} /> AGREGAR</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {locales.map((l) => (
          <div key={l.id} style={{
            background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden",
            opacity: l.activo ? 1 : 0.5,
          }}>
            <div style={{
              height: 90, background: l.imagenUrl ? `url(${l.imagenUrl}) center/cover` : COLORS.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {!l.imagenUrl && <Package size={24} color={COLORS.grey} />}
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.text }}>{l.nombre}</div>
              {l.categoria && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.accent, marginTop: 2 }}>{l.categoria}</div>}
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 4 }}>{l.direccion}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => toggle(l.id)} style={{
                  flex: 1, background: "transparent", border: `1px solid ${l.activo ? COLORS.green : COLORS.grey}66`,
                  color: l.activo ? COLORS.green : COLORS.grey, borderRadius: 5, padding: "6px 0",
                  fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>{l.activo ? "ACTIVO" : "OCULTO"}</button>
                <button onClick={() => del(l.id)} style={{
                  background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.grey,
                  borderRadius: 5, padding: "6px 9px", cursor: "pointer",
                }}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
        {locales.length === 0 && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Todavía no cargaste locales.</div>}
      </div>
    </div>
  );
}

function TabProductos({ locales, productos, saveProductos }) {
  const isMobile = useIsMobile();
  const [localId, setLocalId] = useState(locales[0]?.id || "");
  const [form, setForm] = useState({ nombre: "", precio: "", descripcion: "", imagenUrl: "" });

  useEffect(() => {
    if (!localId && locales.length) setLocalId(locales[0].id);
  }, [locales, localId]);

  const deLocal = productos.filter((p) => p.localId === localId);

  const add = () => {
    if (!localId || !form.nombre.trim() || !form.precio) return;
    saveProductos([...productos, {
      id: uid(), localId, nombre: form.nombre, descripcion: form.descripcion, precio: Number(form.precio) || 0,
      imagenUrl: form.imagenUrl, disponible: true, orden: deLocal.length,
    }]);
    setForm({ nombre: "", precio: "", descripcion: "", imagenUrl: "" });
  };
  const toggle = (id) => saveProductos(productos.map((p) => p.id === id ? { ...p, disponible: !p.disponible } : p));
  const del = (id) => saveProductos(productos.filter((p) => p.id !== id));

  const inputStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 5,
    padding: "9px 10px", color: COLORS.text, fontFamily: "'Inter', sans-serif",
    fontSize: 13, outline: "none",
  };

  if (locales.length === 0) {
    return (
      <div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 8 }}>PRODUCTOS</div>
        <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Primero cargá al menos un local en la pestaña Locales.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>PRODUCTOS</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>El catálogo que ve el cliente al elegir un local</div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 5, display: "block", fontWeight: 500 }}>Local</label>
        <select style={{ ...inputStyle, width: 260 }} value={localId} onChange={(e) => setLocalId(e.target.value)}>
          {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.7fr 1.4fr 1fr auto", gap: 10, marginBottom: 20 }}>
        <input style={inputStyle} placeholder="Nombre del producto" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input style={inputStyle} type="number" placeholder="Precio" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
        <input style={inputStyle} placeholder="Descripción (opcional)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        <input style={inputStyle} placeholder="URL de imagen (opcional)" value={form.imagenUrl} onChange={(e) => setForm({ ...form, imagenUrl: e.target.value })} />
        <button onClick={add} style={{
          background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
          padding: "9px 14px", fontFamily: "'Oswald', sans-serif", fontWeight: 600,
          fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}><Plus size={15} /> AGREGAR</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {deLocal.map((p) => (
          <div key={p.id} style={{
            background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden",
            opacity: p.disponible ? 1 : 0.5,
          }}>
            <div style={{
              height: 80, background: p.imagenUrl ? `url(${p.imagenUrl}) center/cover` : COLORS.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {!p.imagenUrl && <Package size={22} color={COLORS.grey} />}
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.text }}>{p.nombre}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.accent, fontWeight: 700 }}>{money(p.precio)}</div>
              </div>
              {p.descripcion && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginTop: 4 }}>{p.descripcion}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => toggle(p.id)} style={{
                  flex: 1, background: "transparent", border: `1px solid ${p.disponible ? COLORS.green : COLORS.grey}66`,
                  color: p.disponible ? COLORS.green : COLORS.grey, borderRadius: 5, padding: "6px 0",
                  fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>{p.disponible ? "DISPONIBLE" : "AGOTADO"}</button>
                <button onClick={() => del(p.id)} style={{
                  background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.grey,
                  borderRadius: 5, padding: "6px 9px", cursor: "pointer",
                }}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
        {deLocal.length === 0 && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Este local todavía no tiene productos cargados.</div>}
      </div>
    </div>
  );
}

function TabCobros({ pedidos, cadetes, config, saveConfig }) {
  const isMobile = useIsMobile();
  const [cfg, setCfg] = useState(config);
  useEffect(() => setCfg(config), [config]);

  const noCancelados = pedidos.filter((p) => p.estado !== "cancelado");
  const totalTarifas = noCancelados.reduce((s, p) => s + p.tarifaCliente, 0);
  const totalComisiones = noCancelados.reduce((s, p) => s + p.comisionCadete, 0);
  const margen = totalTarifas - totalComisiones;

  const porCadete = cadetes.map((c) => {
    const ps = noCancelados.filter((p) => p.cadeteId === c.id);
    return { cadete: c, cantidad: ps.length, comision: ps.reduce((s, p) => s + p.comisionCadete, 0) };
  }).filter((x) => x.cantidad > 0);

  const inputStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 5,
    padding: "8px 10px", color: COLORS.text, fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13, outline: "none", width: 110,
  };

  const StatCard = ({ label, value, color }) => (
    <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, flex: "1 1 130px" }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 24, color: color || COLORS.text }}>{money(value)}</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 18 }}>COBROS</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total a cobrar a clientes" value={totalTarifas} color={COLORS.accent} />
        <StatCard label="Total a pagar a cadetes" value={totalComisiones} color={COLORS.blue} />
        <StatCard label="Margen del negocio" value={margen} color={COLORS.green} />
      </div>

      <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.text, marginBottom: 12, letterSpacing: "0.03em" }}>TARIFAS POR DEFECTO</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 5 }}>Tarifa cliente</div>
            <input type="number" style={inputStyle} value={cfg.tarifaDefault} onChange={(e) => setCfg({ ...cfg, tarifaDefault: Number(e.target.value) })} />
          </div>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 5 }}>Comisión cadete</div>
            <input type="number" style={inputStyle} value={cfg.comisionDefault} onChange={(e) => setCfg({ ...cfg, comisionDefault: Number(e.target.value) })} />
          </div>
          <button onClick={() => saveConfig(cfg)} style={{
            background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
            padding: "8px 16px", fontFamily: "'Oswald', sans-serif", fontWeight: 600,
            fontSize: 12, cursor: "pointer",
          }}>GUARDAR</button>
        </div>
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${COLORS.line}` }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 5 }}>Contraseña de administración</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="text" style={inputStyle} value={cfg.adminPassword} onChange={(e) => setCfg({ ...cfg, adminPassword: e.target.value })} />
            <button onClick={() => saveConfig(cfg)} style={{
              background: "transparent", color: COLORS.text, border: `1px solid ${COLORS.line}`, borderRadius: 6,
              padding: "8px 16px", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>ACTUALIZAR</button>
          </div>
        </div>
      </div>

      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.text, marginBottom: 10, letterSpacing: "0.03em" }}>LIQUIDACIÓN POR CADETE</div>
      <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden" }}>
        {porCadete.length === 0 && <div style={{ padding: 16, color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Sin datos todavía.</div>}
        {porCadete.map((row, i) => (
          <div key={row.cadete.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderBottom: i < porCadete.length - 1 ? `1px solid ${COLORS.line}` : "none",
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: COLORS.text, fontWeight: 500 }}>{row.cadete.nombre}</div>
            <div style={{ display: "flex", gap: 18, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
              <span style={{ color: COLORS.muted }}>{row.cantidad} pedidos</span>
              <span style={{ color: COLORS.blue, fontWeight: 700 }}>{money(row.comision)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabReportes({ pedidos, cadetes }) {
  const [rango, setRango] = useState("hoy");

  const filtrados = useMemo(() => {
    const now = Date.now();
    const dia = 86400000;
    return pedidos.filter((p) => {
      if (rango === "hoy") return new Date(p.creadoEn).toISOString().slice(0, 10) === todayStr();
      if (rango === "semana") return now - p.creadoEn <= 7 * dia;
      if (rango === "mes") return now - p.creadoEn <= 30 * dia;
      return true;
    });
  }, [pedidos, rango]);

  const entregados = filtrados.filter((p) => p.estado === "entregado");
  const cancelados = filtrados.filter((p) => p.estado === "cancelado");
  const ingresos = entregados.reduce((s, p) => s + p.tarifaCliente, 0);
  const comisiones = entregados.reduce((s, p) => s + p.comisionCadete, 0);

  const ranking = cadetes.map((c) => ({
    nombre: c.nombre,
    entregas: entregados.filter((p) => p.cadeteId === c.id).length,
  })).filter((r) => r.entregas > 0).sort((a, b) => b.entregas - a.entregas);

  const maxEntregas = Math.max(1, ...ranking.map((r) => r.entregas));

  const rangos = [
    { id: "hoy", label: "HOY" }, { id: "semana", label: "7 DÍAS" },
    { id: "mes", label: "30 DÍAS" }, { id: "todo", label: "TODO" },
  ];

  const StatCard = ({ label, value, color }) => (
    <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, flex: "1 1 130px" }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 24, color: color || COLORS.text }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text }}>REPORTES</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {rangos.map((r) => (
            <button key={r.id} onClick={() => setRango(r.id)} style={{
              background: rango === r.id ? COLORS.accent : "transparent",
              color: rango === r.id ? "#16181B" : COLORS.muted,
              border: `1px solid ${rango === r.id ? COLORS.accent : COLORS.line}`,
              borderRadius: 5, padding: "6px 12px", fontFamily: "'Oswald', sans-serif",
              fontWeight: 600, fontSize: 11, letterSpacing: "0.03em", cursor: "pointer",
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <StatCard label="Entregados" value={entregados.length} color={COLORS.green} />
        <StatCard label="Cancelados" value={cancelados.length} color={COLORS.red} />
        <StatCard label="Ingresos" value={money(ingresos)} color={COLORS.accent} />
        <StatCard label="Ganancia neta" value={money(ingresos - comisiones)} color={COLORS.blue} />
      </div>

      <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.text, marginBottom: 10, letterSpacing: "0.03em" }}>RANKING DE ENTREGAS</div>
      <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16 }}>
        {ranking.length === 0 && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Sin entregas en este período.</div>}
        {ranking.map((r, i) => (
          <div key={r.nombre} style={{ marginBottom: i < ranking.length - 1 ? 12 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.text }}>
              <span>{r.nombre}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.muted }}>{r.entregas}</span>
            </div>
            <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(r.entregas / maxEntregas) * 100}%`, background: COLORS.accent, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminApp({ pedidos, savePedidos, cadetes, saveCadetes, locales, saveLocales, productos, saveProductos, pedidoItems, config, saveConfig, onSalir }) {
  const [tab, setTab] = useState("pedidos");
  const isMobile = useIsMobile();
  const counts = {
    activos: pedidos.filter((p) => !["entregado", "cancelado"].includes(p.estado)).length,
    cadetesActivos: cadetes.filter((c) => c.activo).length,
  };
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", background: COLORS.bg, minHeight: "100vh" }}>
      <Sidebar tab={tab} setTab={setTab} counts={counts} />
      <div style={{ flex: 1, padding: isMobile ? "18px 14px 78px" : "28px 32px", overflowX: "auto", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={onSalir} style={{
            background: "none", border: "none", color: COLORS.muted, cursor: "pointer",
            fontFamily: "'Inter', sans-serif", fontSize: 12, padding: 0,
          }}>&larr; Cerrar sesión</button>
          <BotonNotificaciones role="admin" />
        </div>
        {tab === "pedidos" && <TabPedidos pedidos={pedidos} cadetes={cadetes} config={config} savePedidos={savePedidos} pedidoItems={pedidoItems} isMobile={isMobile} />}
        {tab === "cadetes" && <TabCadetes cadetes={cadetes} saveCadetes={saveCadetes} pedidos={pedidos} />}
        {tab === "locales" && <TabLocales locales={locales} saveLocales={saveLocales} />}
        {tab === "productos" && <TabProductos locales={locales} productos={productos} saveProductos={saveProductos} />}
        {tab === "cobros" && <TabCobros pedidos={pedidos} cadetes={cadetes} config={config} saveConfig={saveConfig} />}
        {tab === "reportes" && <TabReportes pedidos={pedidos} cadetes={cadetes} />}
      </div>
    </div>
  );
}

function Landing({ setView, onCrearCuenta }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <div style={{ position: "fixed", top: "calc(18px + env(safe-area-inset-top))", right: "calc(18px + env(safe-area-inset-right))", zIndex: 10 }}>
        <button onClick={() => setMenuAbierto((v) => !v)} style={{
          width: 34, height: 34, borderRadius: 8, background: "transparent",
          border: "none", color: COLORS.grey, cursor: "pointer", opacity: 0.6,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><MoreHorizontal size={18} /></button>

        {menuAbierto && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 10,
            background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8,
            padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 170,
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.5)",
          }}>
            <button onClick={() => { setMenuAbierto(false); setView("cadete"); }} style={{
              display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
              color: COLORS.text, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13,
              padding: "9px 10px", borderRadius: 5, textAlign: "left",
            }}><Truck size={14} color={COLORS.muted} /> Soy cadete</button>
            <button onClick={() => { setMenuAbierto(false); setView("admin"); }} style={{
              display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
              color: COLORS.text, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13,
              padding: "9px 10px", borderRadius: 5, textAlign: "left",
            }}><BarChart3 size={14} color={COLORS.muted} /> Administración</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 9, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RouteIcon size={25} color="#16181B" strokeWidth={2.5} />
        </div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 32, letterSpacing: "0.03em", color: COLORS.text }}>ANDÁ</div>
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: COLORS.muted, marginBottom: 44 }}>Pedís, y ya está.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 300 }}>
        <button onClick={() => setView("cliente")} style={{
          width: "100%", background: COLORS.accent, border: "none", borderRadius: 12,
          padding: "28px 24px", cursor: "pointer", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          boxShadow: `0 10px 30px -10px ${COLORS.accent}55`,
        }}>
          <Package size={30} color="#16181B" strokeWidth={2.2} />
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: "0.02em", color: "#16181B" }}>HACER UN PEDIDO</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#16181B99" }}>Pedí que pasen a buscar tu envío</div>
        </button>

        <button onClick={onCrearCuenta} style={{
          width: "100%", background: "transparent", border: `1px solid ${COLORS.accent}66`, borderRadius: 10,
          padding: "14px 20px", cursor: "pointer", textAlign: "center",
          fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.02em", color: COLORS.accent,
        }}>CREAR CUENTA</button>
      </div>
    </div>
  );
}

function BackLink({ onBack }) {
  return (
    <button onClick={onBack} style={{
      background: "none", border: "none", color: COLORS.muted, cursor: "pointer",
      fontFamily: "'Inter', sans-serif", fontSize: 12, marginBottom: 20, padding: 0,
      display: "flex", alignItems: "center", gap: 4,
    }}>&larr; Volver</button>
  );
}

function ChatPedido({ pedidoId, remitente, soloLectura, alCerrar, notifTipo, notifRefId, notifTexto }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const finRef = useRef(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const { data } = await supabase.from("mensajes").select("*").eq("pedido_id", pedidoId).order("creado_en", { ascending: true });
      if (activo && data) setMensajes(data.map(rowToMensaje));
      setCargando(false);
    })();
    const channel = supabase
      .channel(`chat-${pedidoId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `pedido_id=eq.${pedidoId}` }, (payload) => {
        setMensajes((prev) => [...prev, rowToMensaje(payload.new)]);
      })
      .subscribe();
    return () => { activo = false; supabase.removeChannel(channel); };
  }, [pedidoId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    await supabase.from("mensajes").insert({ pedido_id: pedidoId, remitente, texto: t });
    if (notifTipo) notificar(notifTipo, notifRefId, `Mensaje de ${notifTexto || "tu pedido"}`, t, "/");
  };

  return (
    <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12, color: COLORS.text, letterSpacing: "0.03em" }}>
          <MessageCircle size={14} color={COLORS.accent} /> {soloLectura ? "CHAT DEL PEDIDO" : "CHAT"}
        </div>
        {alCerrar && (
          <button onClick={alCerrar} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer" }}><X size={16} /></button>
        )}
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {cargando && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 12 }}>Cargando...</div>}
        {!cargando && mensajes.length === 0 && (
          <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 12 }}>Todavía no hay mensajes.</div>
        )}
        {mensajes.map((m) => {
          const esMio = !soloLectura && m.remitente === remitente;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: soloLectura ? "flex-start" : (esMio ? "flex-end" : "flex-start") }}>
              <div style={{
                maxWidth: "78%", padding: "7px 11px", borderRadius: 12,
                background: esMio ? COLORS.accent : COLORS.bg,
                color: esMio ? "#16181B" : COLORS.text,
                fontFamily: "'Inter', sans-serif", fontSize: 13,
              }}>
                {soloLectura && (
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 2, color: m.remitente === "cadete" ? COLORS.blue : COLORS.accent }}>
                    {m.remitente === "cadete" ? "CADETE" : "CLIENTE"}
                  </div>
                )}
                {m.texto}
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>
      {!soloLectura && (
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: `1px solid ${COLORS.line}` }}>
          <input
            value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Escribí un mensaje..."
            style={{
              flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 6,
              padding: "9px 10px", color: COLORS.text, fontFamily: "'Inter', sans-serif", fontSize: 13, outline: "none",
            }}
          />
          <button onClick={enviar} style={{
            background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
            width: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}><Send size={15} /></button>
        </div>
      )}
    </div>
  );
}

function Stepper({ estado }) {
  const pasos = ESTADOS.slice(0, 4);
  const idx = pasos.findIndex((e) => e.id === estado);
  const cancelado = estado === "cancelado";
  return (
    <div>
      {cancelado ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
          color: COLORS.red, fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 14,
        }}><Ban size={16} /> PEDIDO CANCELADO</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center" }}>
          {pasos.map((e, i) => {
            const Icon = e.icon;
            const done = i <= idx;
            return (
              <React.Fragment key={e.id}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 60 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? e.color : COLORS.panel2, border: `1px solid ${done ? e.color : COLORS.line}`,
                  }}>
                    <Icon size={15} color={done ? "#16181B" : COLORS.grey} strokeWidth={2.5} />
                  </div>
                  <div style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 9, letterSpacing: "0.02em",
                    color: done ? COLORS.text : COLORS.grey, textAlign: "center", fontWeight: 600,
                  }}>{e.label}</div>
                </div>
                {i < pasos.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < idx ? e.color : COLORS.line, marginBottom: 16 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VistaCliente({ cadetes, config, pedidos, crearPedidoDirecto, locales, productos, pedidoItems, crearPedidoConCarrito, onBack, modoAuthInicial }) {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [perfil, setPerfil] = useState(null);
  const [authModo, setAuthModo] = useState(modoAuthInicial || "login");
  const [authForm, setAuthForm] = useState({ nombre: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [avisoVerificacion, setAvisoVerificacion] = useState(false);
  const [form, setForm] = useState({ direccionRetiro: "", direccion: "", nota: "" });
  const [enviadoId, setEnviadoId] = useState(null);
  const [perfilForm, setPerfilForm] = useState(null);
  const [perfilGuardando, setPerfilGuardando] = useState(false);
  const [perfilMsg, setPerfilMsg] = useState("");
  const [localElegido, setLocalElegido] = useState(null);
  const [carrito, setCarrito] = useState({}); // { [productoId]: { productoId, nombre, precio, cantidad } }
  const [checkout, setCheckout] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [overlay, setOverlay] = useState(null); // null | "perfil" | "mis"
  const [carritoAbierto, setCarritoAbierto] = useState(false); // bottom sheet móvil
  const isMobile = useIsMobile();
  const localesRef = useRef(null);

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = itemsCarrito.reduce((s, it) => s + it.precio * it.cantidad, 0);
  const cantidadCarrito = itemsCarrito.reduce((s, it) => s + it.cantidad, 0);

  const agregar = (producto) => {
    setCarrito((c) => {
      const actual = c[producto.id];
      return { ...c, [producto.id]: { productoId: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: (actual?.cantidad || 0) + 1 } };
    });
  };
  const quitar = (productoId) => {
    setCarrito((c) => {
      const actual = c[productoId];
      if (!actual) return c;
      if (actual.cantidad <= 1) { const { [productoId]: _, ...resto } = c; return resto; }
      return { ...c, [productoId]: { ...actual, cantidad: actual.cantidad - 1 } };
    });
  };
  const elegirLocal = (local) => { setLocalElegido(local); setCarrito({}); setCheckout(false); };
  const volverALocales = () => { setLocalElegido(null); setCarrito({}); setCheckout(false); };

  const carritoBoton = {
    width: 28, height: 28, borderRadius: 7, background: COLORS.panel2, color: COLORS.text,
    border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };
  const menuItem = {
    display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none",
    color: COLORS.text, fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12,
    letterSpacing: "0.04em", padding: "10px 12px", cursor: "pointer", textAlign: "left", borderRadius: 6,
  };
  const volverLink = {
    background: "none", border: "none", color: COLORS.muted, cursor: "pointer",
    fontFamily: "'Inter', sans-serif", fontSize: 12, marginBottom: 14, padding: 0,
    display: "flex", alignItems: "center", gap: 4,
  };

  const carritoPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${COLORS.accent}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingCart size={18} color={COLORS.accent} />
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 17, color: COLORS.text, letterSpacing: "0.02em" }}>
            TU PEDIDO
          </div>
        </div>
        {isMobile && (
          <button onClick={() => setCarritoAbierto(false)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6 }}>
            <X size={20} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 20px" }}>
        {itemsCarrito.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 8px" }}>
            <ShoppingCart size={30} color={COLORS.grey} style={{ marginBottom: 10 }} />
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>Tu carrito está vacío</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.grey }}>Sumá productos del menú</div>
          </div>
        ) : (
          itemsCarrito.map((it) => (
            <div key={it.productoId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${COLORS.line}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.nombre}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.accent, marginTop: 2 }}>{money(it.precio)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => quitar(it.productoId)} style={carritoBoton}>{it.cantidad > 1 ? <Minus size={14} /> : <Trash2 size={14} />}</button>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.text, minWidth: 16, textAlign: "center" }}>{it.cantidad}</span>
                <button onClick={() => agregar(productos.find((p) => p.id === it.productoId))} style={carritoBoton}><Plus size={14} /></button>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.text, minWidth: 54, textAlign: "right" }}>{money(it.precio * it.cantidad)}</div>
            </div>
          ))
        )}
      </div>
      {!checkout && (
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${COLORS.line}`, background: COLORS.panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted }}>{cantidadCarrito} {cantidadCarrito === 1 ? "producto" : "productos"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: COLORS.accentYellow, fontWeight: 700 }}>{money(totalCarrito)}</span>
          </div>
          <button onClick={() => { setCheckout(true); setCarritoAbierto(false); }} style={{
            width: "100%", background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 8,
            padding: "13px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.04em", cursor: "pointer",
          }}>HACER PEDIDO</button>
        </div>
      )}
    </div>
  );

  useEffect(() => {
    if (perfil) setPerfilForm({
      nombre: perfil.nombre || "", telefono: perfil.telefono || "",
      direccion: perfil.direccion || "", fecha_nacimiento: perfil.fecha_nacimiento || "",
    });
  }, [perfil]);

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.line}`,
    borderRadius: 6, padding: "12px 12px", color: COLORS.text,
    fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box",
  };
  const label = { fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 6, display: "block", fontWeight: 500 };

  // Sesión de Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Cuando hay sesión, aseguramos que exista el perfil en "clientes" (nombre, email)
  useEffect(() => {
    if (!session) { setPerfil(null); return; }
    let cancelado = false;
    (async () => {
      const { data } = await supabase.from("clientes").select("*").eq("id", session.user.id).maybeSingle();
      if (data) { if (!cancelado) setPerfil(data); return; }
      const nombre = session.user.user_metadata?.nombre || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Cliente";
      const fotoUrl = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null;
      const { data: creado } = await supabase.from("clientes")
        .upsert({ id: session.user.id, nombre, email: session.user.email, foto_url: fotoUrl }, { onConflict: "id" })
        .select().maybeSingle();
      if (cancelado) return;
      if (creado) { setPerfil(creado); return; }
      // Otro intento concurrente ya lo creó: lo volvemos a leer
      const { data: reintento } = await supabase.from("clientes").select("*").eq("id", session.user.id).maybeSingle();
      if (!cancelado && reintento) setPerfil(reintento);
    })();
    return () => { cancelado = true; };
  }, [session?.user?.id]);

  const submitAuth = async () => {
    setAuthError("");
    const email = authForm.email.trim();
    if (authModo === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: authForm.password });
      if (error) setAuthError(error.message.includes("Invalid") ? "Email o contraseña incorrectos" : error.message.includes("confirm") ? "Confirmá tu email antes de ingresar" : error.message);
    } else {
      if (!authForm.nombre.trim() || !email || !authForm.password.trim()) { setAuthError("Completá todos los campos"); return; }
      const { error } = await supabase.auth.signUp({
        email, password: authForm.password,
        options: { data: { nombre: authForm.nombre.trim() } },
      });
      if (error) setAuthError(error.message.includes("already registered") || error.message.includes("already exists") ? "Ya existe una cuenta con ese email" : error.message);
      else setAvisoVerificacion(true);
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const loginSocial = async (provider) => {
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  // --- Pantalla: revisá tu correo ---
  if (avisoVerificacion) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div style={{
            width: 52, height: 52, borderRadius: 26, background: `${COLORS.accent}1A`, margin: "0 auto 18px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Check size={26} color={COLORS.accent} strokeWidth={2.5} /></div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.text, marginBottom: 8 }}>REVISÁ TU CORREO</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.muted, marginBottom: 24 }}>
            Te enviamos un link de confirmación a {authForm.email}. Confirmá tu cuenta y después iniciá sesión.
          </div>
          <button onClick={() => { setAvisoVerificacion(false); setAuthModo("login"); }} style={{
            background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
            padding: "10px 20px", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>YA CONFIRMÉ, INICIAR SESIÓN</button>
        </div>
      </div>
    );
  }

  // --- Pantalla de login / registro ---
  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: COLORS.muted, fontFamily: "'Inter', sans-serif" }}>Cargando...</div>
      </div>
    );
  }

  if (!session || !perfil) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <BackLink onBack={onBack} />
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>
            {authModo === "login" ? "INICIAR SESIÓN" : "CREAR CUENTA"}
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 22 }}>
            Necesitás una cuenta verificada para hacer un pedido
          </div>

          {authModo === "signup" && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Tu nombre</label>
              <input style={inputStyle} value={authForm.nombre} onChange={(e) => { setAuthForm({ ...authForm, nombre: e.target.value }); setAuthError(""); }} placeholder="Nombre y apellido" />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Email</label>
            <input type="email" style={inputStyle} value={authForm.email} onChange={(e) => { setAuthForm({ ...authForm, email: e.target.value }); setAuthError(""); }} placeholder="tu@email.com" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={label}>Contraseña</label>
            <input
              type="password" style={inputStyle} value={authForm.password}
              onChange={(e) => { setAuthForm({ ...authForm, password: e.target.value }); setAuthError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitAuth()}
              placeholder="Contraseña (mínimo 6 caracteres)"
            />
          </div>
          {authError && <div style={{ color: COLORS.red, fontFamily: "'Inter', sans-serif", fontSize: 12, marginBottom: 10 }}>{authError}</div>}
          <button onClick={submitAuth} style={{
            width: "100%", background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
            padding: "12px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.03em", cursor: "pointer", marginTop: 8, marginBottom: 14,
          }}>{authModo === "login" ? "INGRESAR" : "CREAR CUENTA"}</button>
          <button onClick={() => { setAuthModo(authModo === "login" ? "signup" : "login"); setAuthError(""); }} style={{
            width: "100%", background: "none", color: COLORS.muted, border: "none",
            fontFamily: "'Inter', sans-serif", fontSize: 12, cursor: "pointer", textDecoration: "underline",
          }}>{authModo === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Iniciá sesión"}</button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: COLORS.line }} />
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.grey }}>o continuá con</div>
            <div style={{ flex: 1, height: 1, background: COLORS.line }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => loginSocial("google")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", background: COLORS.panel2, color: COLORS.text, border: `1px solid ${COLORS.line}`,
              borderRadius: 6, padding: "11px 0", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Continuar con Google</button>
          </div>
        </div>
      </div>
    );
  }

  const guardarPerfil = async () => {
    setPerfilGuardando(true); setPerfilMsg("");
    const { data, error } = await supabase.from("clientes").update({
      nombre: perfilForm.nombre.trim() || perfil.nombre,
      telefono: perfilForm.telefono.trim() || null,
      direccion: perfilForm.direccion.trim() || null,
      fecha_nacimiento: perfilForm.fecha_nacimiento || null,
    }).eq("id", perfil.id).select().maybeSingle();
    setPerfilGuardando(false);
    if (error) { setPerfilMsg("No se pudo guardar. Probá de nuevo."); return; }
    if (data) setPerfil(data);
    setPerfilMsg("Guardado ✓");
  };

  const subirFoto = async (file) => {
    if (!file) return;
    setPerfilMsg("");
    const ext = file.name.split(".").pop();
    const path = `${perfil.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setPerfilMsg("No se pudo subir la foto."); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    const { data } = await supabase.from("clientes").update({ foto_url: url }).eq("id", perfil.id).select().maybeSingle();
    if (data) setPerfil(data);
  };

  const submit = () => {
    if (!form.direccion.trim()) return;
    const conCarrito = localElegido && itemsCarrito.length > 0;
    if (!conCarrito && !form.direccionRetiro.trim()) return;
    const pedidoId = uid();
    const pedido = {
      id: pedidoId, cliente: perfil.nombre,
      direccionRetiro: conCarrito ? localElegido.direccion : form.direccionRetiro,
      direccion: form.direccion, telefono: perfil.email, nota: form.nota,
      tarifaCliente: conCarrito ? totalCarrito : config.tarifaDefault,
      comisionCadete: config.comisionDefault,
      subtotalProductos: conCarrito ? totalCarrito : 0, tarifaEnvio: null,
      localId: conCarrito ? localElegido.id : null,
      cadeteId: null, clienteId: perfil.id, estado: "pendiente", creadoEn: Date.now(), entregadoEn: null,
    };
    if (conCarrito) {
      crearPedidoConCarrito(pedido, itemsCarrito);
    } else {
      crearPedidoDirecto(pedido);
    }
    notificar("admin", null, "Nuevo pedido", `${pedido.cliente} — ${pedido.direccion}`, "/");
    setEnviadoId(pedidoId);
    setLocalElegido(null); setCarrito({}); setCheckout(false);
  };

  const misPedidos = pedidos.filter((p) => p.clienteId === perfil.id).sort((a, b) => b.creadoEn - a.creadoEn);

  if (enviadoId) {
    const actual = pedidos.find((p) => p.id === enviadoId);
    if (!actual) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ color: COLORS.muted, fontFamily: "'Inter', sans-serif" }}>Cargando...</div>
        </div>
      );
    }
    const cadete = cadetes.find((c) => c.id === actual.cadeteId);
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.text, marginBottom: 6 }}>SEGUIMIENTO DE TU PEDIDO</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 28 }}>{actual.direccion}</div>
          <Stepper estado={actual.estado} />
          {cadete && actual.estado !== "cancelado" && (
            <div style={{ marginTop: 26, fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.text }}>
              Tu cadete: <strong>{cadete.nombre}</strong>
            </div>
          )}
          {cadete && ["asignado", "en_camino"].includes(actual.estado) && (
            <div style={{ marginTop: 16, textAlign: "left" }}>
              {chatAbierto ? (
                <ChatPedido pedidoId={actual.id} remitente="cliente" alCerrar={() => setChatAbierto(false)} notifTipo={cadete ? "cadete" : null} notifRefId={actual.cadeteId} notifTexto={perfil.nombre} />
              ) : (
                <button onClick={() => setChatAbierto(true)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: "transparent", color: COLORS.accent, border: `1px solid ${COLORS.accent}66`, borderRadius: 6,
                  padding: "10px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.03em", cursor: "pointer",
                }}><MessageCircle size={14} /> CHATEAR CON TU CADETE</button>
              )}
            </div>
          )}
          {actual.estado === "en_camino" && actual.ubicacion && (
            <div style={{ marginTop: 18, textAlign: "left" }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12, color: COLORS.green, letterSpacing: "0.04em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={13} /> UBICACIÓN EN VIVO · {timeAgo(actual.ubicacion.ts)}
              </div>
              <iframe
                title="ubicacion-cadete"
                width="100%" height="220"
                style={{ border: `1px solid ${COLORS.line}`, borderRadius: 8, display: "block" }}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${actual.ubicacion.lng - 0.01}%2C${actual.ubicacion.lat - 0.01}%2C${actual.ubicacion.lng + 0.01}%2C${actual.ubicacion.lat + 0.01}&layer=mapnik&marker=${actual.ubicacion.lat}%2C${actual.ubicacion.lng}`}
              />
              <a
                href={`https://www.openstreetmap.org/?mlat=${actual.ubicacion.lat}&mlon=${actual.ubicacion.lng}#map=16/${actual.ubicacion.lat}/${actual.ubicacion.lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: "block", textAlign: "center", marginTop: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted }}
              >Abrir mapa completo</a>
            </div>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => { setEnviadoId(null); setForm({ direccionRetiro: "", direccion: "", nota: "" }); }} style={{
              background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
              padding: "10px 18px", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>HACER OTRO PEDIDO</button>
            <button onClick={onBack} style={{
              background: "none", color: COLORS.muted, border: `1px solid ${COLORS.line}`, borderRadius: 6,
              padding: "10px 18px", fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: "pointer",
            }}>VOLVER AL INICIO</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: COLORS.bg }}>
      {/* Barra superior */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30, background: COLORS.panel,
        borderBottom: `1px solid ${COLORS.line}`,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {onBack && (
              <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6, display: "flex", alignItems: "center" }}>
                <ChevronRight size={18} style={{ transform: "rotate(180deg)" }} />
              </button>
            )}
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.text, letterSpacing: "0.05em" }}>
              ANDÁ<span style={{ color: COLORS.accent }}>.</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isMobile && <BotonNotificaciones role="cliente" refId={perfil.id} />}
            {isMobile && cantidadCarrito > 0 && !checkout && (
              <button onClick={() => setCarritoAbierto(true)} style={{
                position: "relative", background: "transparent", border: "none", color: COLORS.text, cursor: "pointer", padding: 6,
              }}>
                <ShoppingCart size={20} />
                <span style={{
                  position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, background: COLORS.accent,
                  color: "#16181B", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                }}>{cantidadCarrito}</span>
              </button>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuAbierto(!menuAbierto)} style={{
                display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 4,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 17, overflow: "hidden", flexShrink: 0,
                  background: COLORS.panel2, border: `1px solid ${COLORS.accent}55`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {perfil.foto_url
                    ? <img src={perfil.foto_url} alt="Foto de perfil" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, color: COLORS.accent }}>{perfil.nombre[0]?.toUpperCase()}</span>}
                </div>
                <ChevronDown size={14} color={menuAbierto ? COLORS.accent : COLORS.muted} style={{ transform: menuAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>

              {menuAbierto && <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setMenuAbierto(false)} />}
              {menuAbierto && (
                <div style={{
                  position: "absolute", top: 46, right: 0, zIndex: 61, width: 230,
                  background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.45)",
                  overflow: "hidden", padding: 6,
                }}>
                  <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${COLORS.line}`, marginBottom: 4 }}>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.text }}>{perfil.nombre}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted }}>{perfil.email}</div>
                  </div>
                  <button onClick={() => { setOverlay("perfil"); setMenuAbierto(false); }} style={menuItem}>
                    <User size={15} color={COLORS.accent} /> MI PERFIL
                  </button>
                  <button onClick={() => { setOverlay("mis"); setMenuAbierto(false); }} style={menuItem}>
                    <History size={15} color={COLORS.accent} /> MIS PEDIDOS
                    {misPedidos.length > 0 && <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.muted }}>{misPedidos.length}</span>}
                  </button>
                  {isMobile && <div style={{ padding: "8px 12px" }}><BotonNotificaciones role="cliente" refId={perfil.id} style={{ width: "100%", justifyContent: "center" }} /></div>}
                  <button onClick={cerrarSesion} style={{ ...menuItem, color: COLORS.red, borderTop: `1px solid ${COLORS.line}`, marginTop: 4, borderRadius: 0 }}>
                    <LogOut size={15} color={COLORS.red} /> CERRAR SESIÓN
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Contenido principal */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "22px 20px 130px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>
              HOLA, {perfil.nombre.split(" ")[0].toUpperCase()}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 22 }}>
              {overlay === "perfil" ? "Tus datos y preferencias" : overlay === "mis" ? "Seguí tus envíos" : localElegido ? `Menú de ${localElegido.nombre}` : "Elegí un local para empezar"}
            </div>

            {overlay === "perfil" ? (
              <div>
                <button onClick={() => { setOverlay(null); localesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} style={volverLink}>
                  &larr; Volver al menú
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 36, overflow: "hidden", flexShrink: 0,
                    background: COLORS.panel2, border: `1px solid ${COLORS.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {perfil.foto_url
                      ? <img src={perfil.foto_url} alt="Foto de perfil" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 24, color: COLORS.muted }}>{perfil.nombre[0]?.toUpperCase()}</span>}
                  </div>
                  <div>
                    <label style={{
                      display: "inline-block", background: "transparent", color: COLORS.accent,
                      border: `1px solid ${COLORS.accent}66`, borderRadius: 6, padding: "7px 14px",
                      fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>
                      CAMBIAR FOTO
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => subirFoto(e.target.files?.[0])} />
                    </label>
                  </div>
                </div>

                {perfilForm && (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <label style={label}>Nombre</label>
                      <input style={inputStyle} value={perfilForm.nombre} onChange={(e) => setPerfilForm({ ...perfilForm, nombre: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={label}>Fecha de nacimiento</label>
                      <input type="date" style={inputStyle} value={perfilForm.fecha_nacimiento} onChange={(e) => setPerfilForm({ ...perfilForm, fecha_nacimiento: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={label}>Teléfono</label>
                      <input style={inputStyle} value={perfilForm.telefono} onChange={(e) => setPerfilForm({ ...perfilForm, telefono: e.target.value })} placeholder="Tu número de teléfono" />
                    </div>
                    <div style={{ marginBottom: 22 }}>
                      <label style={label}>Dirección habitual</label>
                      <input style={inputStyle} value={perfilForm.direccion} onChange={(e) => setPerfilForm({ ...perfilForm, direccion: e.target.value })} placeholder="Para no escribirla cada vez" />
                    </div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>Email: {perfil.email}</div>
                    {perfilMsg && <div style={{ color: perfilMsg.includes("✓") ? COLORS.green : COLORS.red, fontFamily: "'Inter', sans-serif", fontSize: 12, marginBottom: 10 }}>{perfilMsg}</div>}
                    <button onClick={guardarPerfil} disabled={perfilGuardando} style={{
                      background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
                      padding: "12px 20px", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
                      letterSpacing: "0.03em", cursor: perfilGuardando ? "default" : "pointer", opacity: perfilGuardando ? 0.6 : 1,
                    }}>{perfilGuardando ? "GUARDANDO..." : "GUARDAR CAMBIOS"}</button>
                  </>
                )}
              </div>
            ) : overlay === "mis" ? (
              <div>
                <button onClick={() => { setOverlay(null); localesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} style={volverLink}>
                  &larr; Volver al menú
                </button>
                {misPedidos.length === 0 && <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Todavía no hiciste ningún pedido.</div>}
                {misPedidos.map((p) => (
                  <div key={p.id} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, marginBottom: 12, cursor: "pointer" }} onClick={() => setEnviadoId(p.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.text }}>{p.direccion}</div>
                      <Badge estado={p.estado} />
                    </div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted }}>
                      {new Date(p.creadoEn).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            ) : !localElegido ? (
              <div ref={localesRef}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>Elegí un local para pedir</div>
                {locales && locales.filter((l) => l.activo).length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    {locales.filter((l) => l.activo).map((l) => (
                      <button key={l.id} onClick={() => elegirLocal(l)} style={{
                        display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer",
                        background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 12,
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 6, flexShrink: 0,
                          background: l.imagenUrl ? `url(${l.imagenUrl}) center/cover` : COLORS.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {!l.imagenUrl && <Package size={20} color={COLORS.grey} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.text }}>{l.nombre}</div>
                          {l.categoria && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.accent, marginTop: 2 }}>{l.categoria}</div>}
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{l.direccion}</div>
                        </div>
                        <ChevronRight size={16} color={COLORS.muted} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13, marginBottom: 20 }}>Todavía no hay locales cargados.</div>
                )}

                <div style={{ borderTop: `1px solid ${COLORS.line}`, paddingTop: 18 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>¿No encontrás tu local? Cargá la dirección vos mismo:</div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={label}>Dirección de retiro</label>
                    <input style={inputStyle} value={form.direccionRetiro} onChange={(e) => setForm({ ...form, direccionRetiro: e.target.value })} placeholder="¿Dónde pasamos a buscar?" />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={label}>Dirección de entrega</label>
                    <input style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Calle y número" />
                  </div>
                  <div style={{ marginBottom: 22 }}>
                    <label style={label}>Nota (opcional)</label>
                    <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: "'Inter', sans-serif" }} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej: timbre roto, dejar en portería, referencia de piso, etc." />
                  </div>
                  <button onClick={submit} style={{
                    width: "100%", background: "transparent", color: COLORS.accent, border: `1px solid ${COLORS.accent}66`, borderRadius: 6,
                    padding: "12px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
                    letterSpacing: "0.03em", cursor: "pointer",
                  }}>CONFIRMAR SIN CATÁLOGO</button>
                </div>
              </div>
            ) : !checkout ? (
              <>
                <button onClick={volverALocales} style={volverLink}>&larr; Otro local</button>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 18, color: COLORS.text, marginBottom: 2 }}>{localElegido.nombre}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>{localElegido.direccion}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: isMobile ? 120 : 20 }}>
                  {productos.filter((p) => p.localId === localElegido.id && p.disponible).map((p) => {
                    const enCarrito = carrito[p.id]?.cantidad || 0;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 12 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 6, flexShrink: 0,
                          background: p.imagenUrl ? `url(${p.imagenUrl}) center/cover` : COLORS.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {!p.imagenUrl && <Package size={18} color={COLORS.grey} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.text }}>{p.nombre}</div>
                          {p.descripcion && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{p.descripcion}</div>}
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.accent, marginTop: 3 }}>{money(p.precio)}</div>
                        </div>
                        {enCarrito > 0 ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => quitar(p.id)} style={{ width: 26, height: 26, borderRadius: 5, background: COLORS.bg, border: `1px solid ${COLORS.line}`, color: COLORS.text, cursor: "pointer" }}>−</button>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.text, minWidth: 16, textAlign: "center" }}>{enCarrito}</span>
                            <button onClick={() => agregar(p)} style={{ width: 26, height: 26, borderRadius: 5, background: COLORS.accent, border: "none", color: "#16181B", cursor: "pointer", fontWeight: 700 }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => agregar(p)} style={{
                            background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
                            padding: "7px 12px", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer",
                          }}>AGREGAR</button>
                        )}
                      </div>
                    );
                  })}
                  {productos.filter((p) => p.localId === localElegido.id && p.disponible).length === 0 && (
                    <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Este local todavía no tiene productos cargados.</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setCheckout(false)} style={volverLink}>&larr; Seguir agregando</button>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 18, color: COLORS.text, marginBottom: 14 }}>TU PEDIDO</div>
                <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
                  {itemsCarrito.map((it) => (
                    <div key={it.productoId} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.text, marginBottom: 6 }}>
                      <span>{it.cantidad}x {it.nombre}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(it.precio * it.cantidad)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.accent, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.line}` }}>
                    <span>Subtotal</span>
                    <span>{money(totalCarrito)}</span>
                  </div>
                </div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.muted, marginBottom: 18 }}>El costo del envío se define después de confirmar el pedido.</div>

                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Dirección de entrega</label>
                  <input style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Calle y número" />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={label}>Nota (opcional)</label>
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: "'Inter', sans-serif" }} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej: timbre roto, dejar en portería, referencia de piso, etc." />
                </div>

                <button onClick={submit} style={{
                  width: "100%", background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
                  padding: "13px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14,
                  letterSpacing: "0.03em", cursor: "pointer",
                }}>CONFIRMAR PEDIDO</button>
              </>
            )}
          </div>
        </div>

        {/* Carrito lateral (desktop) */}
        {!isMobile && (
          <div style={{
            width: 360, flexShrink: 0, borderLeft: `1px solid ${COLORS.line}`, background: COLORS.panel,
            display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
          }}>
            {carritoPanel}
          </div>
        )}
      </div>

      {/* Cartel de pedido + carrito en móvil */}
      {isMobile && cantidadCarrito > 0 && !checkout && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: COLORS.panel,
          borderTop: `1px solid ${COLORS.line}`, padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 11, color: COLORS.muted, letterSpacing: "0.05em", marginBottom: 2 }}>
              TU PEDIDO · {cantidadCarrito} {cantidadCarrito === 1 ? "PRODUCTO" : "PRODUCTOS"}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: COLORS.accentYellow, fontWeight: 700 }}>{money(totalCarrito)}</div>
          </div>
          <button onClick={() => setCarritoAbierto(true)} style={{
            background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 8,
            padding: "12px 22px", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap",
          }}>VER CARRITO</button>
        </div>
      )}

      {/* Bottom sheet carrito (móvil) */}
      {isMobile && carritoAbierto && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.55)" }} onClick={() => setCarritoAbierto(false)} />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: COLORS.panel,
            borderTop: `1px solid ${COLORS.line}`, borderTopLeftRadius: 16, borderTopRightRadius: 16,
            maxHeight: "78vh", display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 -12px 40px rgba(0,0,0,.5)",
          }}>
            {carritoPanel}
          </div>
        </>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

function VistaCadete({ cadetes, pedidos, actualizarPedido, onBack }) {
  const [cadeteId, setCadeteId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [chatAbiertoId, setChatAbiertoId] = useState(null);
  const cadete = cadetes.find((c) => c.id === cadeteId);
  const lastSentRef = React.useRef(0);

  // Sesión de Supabase Auth: un cadete logueado entra directo a su tablero
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user || null;
      if (u?.user_metadata?.rol === "cadete") {
        setCadeteId(u.user_metadata.cadete_id || "");
        setAutenticado(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_ev, s) => {
      const u = s?.user || null;
      if (u?.user_metadata?.rol === "cadete") {
        setCadeteId(u.user_metadata.cadete_id || "");
        setAutenticado(true);
      } else {
        setAutenticado(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const advance = (id) => {
    const p = pedidos.find((x) => x.id === id);
    const sig = nextEstado[p.estado];
    actualizarPedido(id, { estado: sig, entregadoEn: sig === "entregado" ? Date.now() : p.entregadoEn });
    if (p?.clienteId) {
      if (sig === "en_camino") notificar("cliente", p.clienteId, "Tu cadete está en camino", `Tu pedido a ${p.direccion} está en camino.`, "/");
      if (sig === "entregado") notificar("cliente", p.clienteId, "Pedido entregado", `Tu pedido a ${p.direccion} fue entregado.`, "/");
    }
  };

  const tomar = (id) => actualizarPedido(id, { cadeteId, estado: "asignado" });

  const enCaminoIds = React.useMemo(
    () => pedidos.filter((p) => p.cadeteId === cadeteId && p.estado === "en_camino").map((p) => p.id),
    [pedidos, cadeteId]
  );
  const enCaminoKey = enCaminoIds.join(",");

  useEffect(() => {
    if (!autenticado || enCaminoIds.length === 0 || !navigator.geolocation) return;
    setTrackingError("");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < 8000) return;
        lastSentRef.current = now;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: now };
        for (const pid of enCaminoIds) actualizarPedido(pid, { ubicacion: coords });
      },
      () => setTrackingError("No pudimos acceder a tu ubicación. Activá el GPS y los permisos de ubicación."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado, enCaminoKey]);

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.line}`,
    borderRadius: 6, padding: "11px 12px", color: COLORS.text,
    fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  if (!cadete) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <BackLink onBack={onBack} />
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text, marginBottom: 18 }}>¿QUIÉN SOS?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cadetes.filter((c) => c.activo).map((c) => (
              <button key={c.id} onClick={() => { setCadeteId(c.id); setError(""); setPassword(""); }} style={{
                background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 7,
                padding: "13px 16px", textAlign: "left", color: COLORS.text, cursor: "pointer",
                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>{c.nombre} <ChevronRight size={16} color={COLORS.muted} /></button>
            ))}
            {cadetes.filter((c) => c.activo).length === 0 && (
              <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>No hay cadetes activos cargados todavía.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!autenticado) {
    const intentar = async () => {
      if (!password.trim()) { setError("Ingresá tu contraseña"); return; }
      setCargando(true); setError("");
      const { error } = await supabase.auth.signInWithPassword({ email: emailCadete(cadeteId), password });
      setCargando(false);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        setError(msg.includes("invalid") || msg.includes("password") ? "Contraseña incorrecta" : "No pudimos iniciar sesión. Probá de nuevo.");
      }
    };
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <BackLink onBack={() => { setCadeteId(""); setPassword(""); setError(""); }} />
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.text, marginBottom: 4 }}>HOLA, {cadete.nombre.toUpperCase()}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>Ingresá tu contraseña</div>
          <input
            type="password" style={inputStyle} value={password} autoFocus
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && intentar()}
            placeholder="Contraseña"
          />
          {error && <div style={{ color: COLORS.red, fontFamily: "'Inter', sans-serif", fontSize: 12, marginTop: 8 }}>{error}</div>}
          <button onClick={intentar} disabled={cargando} style={{
            width: "100%", marginTop: 16, background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
            padding: "12px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.03em", cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.6 : 1,
          }}>{cargando ? "INGRESANDO..." : "INGRESAR"}</button>
        </div>
      </div>
    );
  }

  const disponibles = pedidos.filter((p) => p.estado === "pendiente" && !p.cadeteId).sort((a, b) => a.creadoEn - b.creadoEn);
  const mios = pedidos.filter((p) => p.cadeteId === cadeteId && !["entregado", "cancelado"].includes(p.estado))
    .sort((a, b) => a.creadoEn - b.creadoEn);
  const entregadosHoy = pedidos.filter((p) => p.cadeteId === cadeteId && p.estado === "entregado" && new Date(p.entregadoEn).toISOString().slice(0, 10) === todayStr());

  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <BackLink onBack={() => { setCadeteId(""); setAutenticado(false); setPassword(""); }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.text }}>HOLA, {cadete.nombre.toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button onClick={async () => { await supabase.auth.signOut(); setCadeteId(""); setPassword(""); }} style={{ background: "none", border: "none", color: COLORS.muted, fontFamily: "'Inter', sans-serif", fontSize: 12, cursor: "pointer" }}>Cerrar sesión</button>
            <BotonNotificaciones role="cadete" refId={cadeteId} />
          </div>
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 24 }}>
          {mios.length} pendientes · {entregadosHoy.length} entregados hoy
        </div>

        {disponibles.length > 0 && (
          <>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.accent, letterSpacing: "0.04em", marginBottom: 10 }}>
              PEDIDOS DISPONIBLES ({disponibles.length})
            </div>
            {disponibles.map((p) => (
              <div key={p.id} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.accent}44`, borderRadius: 8, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: COLORS.text }}>{p.cliente}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.blue }}>{money(p.comisionCadete)}</div>
                </div>
                {p.direccionRetiro && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.muted, fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 3 }}>
                    <MapPin size={13} color={COLORS.accent} /> Retiro: {p.direccionRetiro}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.muted, fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 10 }}>
                  <MapPin size={13} color={COLORS.green} /> Entrega: {p.direccion}
                </div>
                <button onClick={() => tomar(p.id)} style={{
                  width: "100%", background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
                  padding: "10px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
                  letterSpacing: "0.03em", cursor: "pointer",
                }}>TOMAR PEDIDO</button>
              </div>
            ))}
          </>
        )}

        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 13, color: COLORS.text, letterSpacing: "0.04em", marginBottom: 10, marginTop: disponibles.length > 0 ? 26 : 0 }}>
          MIS ENTREGAS
        </div>
        {mios.length === 0 && (
          <div style={{ color: COLORS.grey, fontFamily: "'Inter', sans-serif", fontSize: 13, padding: "10px 0" }}>No tenés entregas asignadas por ahora.</div>
        )}

        {mios.map((p) => (
          <div key={p.id} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: COLORS.text }}>{p.cliente}</div>
              <Badge estado={p.estado} />
            </div>
            {p.direccionRetiro && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.muted, fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 3 }}>
                <MapPin size={13} color={COLORS.accent} /> Retiro: {p.direccionRetiro}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.muted, fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 3 }}>
              <MapPin size={13} color={COLORS.green} /> Entrega: {p.direccion}
            </div>
            {p.telefono && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.muted, fontSize: 13, fontFamily: "'Inter', sans-serif", marginBottom: 10 }}>
                <Phone size={13} /> {p.telefono}
              </div>
            )}
            {p.nota && (
              <div style={{ color: COLORS.accent, fontSize: 12, fontFamily: "'Inter', sans-serif", fontStyle: "italic", marginBottom: 10 }}>"{p.nota}"</div>
            )}
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.blue, marginBottom: 12 }}>Tu comisión: {money(p.comisionCadete)}</div>
            {p.estado === "en_camino" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, color: trackingError ? COLORS.red : COLORS.green, fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
                <MapPin size={13} /> {trackingError || "Compartiendo tu ubicación en vivo"}
              </div>
            )}
            {chatAbiertoId === p.id ? (
              <ChatPedido pedidoId={p.id} remitente="cadete" alCerrar={() => setChatAbiertoId(null)} notifTipo={p.clienteId ? "cliente" : null} notifRefId={p.clienteId} notifTexto={cadete.nombre} />
            ) : (
              <button onClick={() => setChatAbiertoId(p.id)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "transparent", color: COLORS.accent, border: `1px solid ${COLORS.accent}66`, borderRadius: 6,
                padding: "9px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: "0.03em", cursor: "pointer", marginBottom: 10,
              }}><MessageCircle size={13} /> CHAT CON EL CLIENTE</button>
            )}
            {nextEstado[p.estado] && (
              <button onClick={() => advance(p.id)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
                padding: "11px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
                letterSpacing: "0.03em", cursor: "pointer",
              }}>MARCAR {ESTADOS.find((e) => e.id === nextEstado[p.estado]).label} <ChevronRight size={15} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminLogin({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.line}`,
    borderRadius: 6, padding: "11px 12px", color: COLORS.text,
    fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const intentar = async () => {
    if (!email.trim() || !password.trim()) { setError("Completá email y contraseña"); return; }
    setCargando(true); setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setCargando(false); setError("Email o contraseña incorrectos"); return; }
    if (data.user?.user_metadata?.rol !== "admin") {
      await supabase.auth.signOut();
      setCargando(false);
      setError("Esta cuenta no tiene permisos de administración");
      return;
    }
    setCargando(false);
    onSuccess();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <BackLink onBack={onBack} />
        <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 20, color: COLORS.text, marginBottom: 4 }}>PANEL DE ADMINISTRACIÓN</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 18 }}>Ingresá con tu cuenta de administrador</div>
        <div style={{ marginBottom: 12 }}>
          <input
            type="email" style={inputStyle} value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="Email"
          />
        </div>
        <input
          type="password" style={inputStyle} value={password} autoFocus
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && intentar()}
          placeholder="Contraseña"
        />
        {error && <div style={{ color: COLORS.red, fontFamily: "'Inter', sans-serif", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={intentar} disabled={cargando} style={{
          width: "100%", marginTop: 16, background: COLORS.accent, color: "#16181B", border: "none", borderRadius: 6,
          padding: "12px 0", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13,
          letterSpacing: "0.03em", cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.6 : 1,
        }}>{cargando ? "INGRESANDO..." : "INGRESAR"}</button>
      </div>
    </div>
  );
}

export default function CadeteriaApp() {
  const [view, setView] = useState("landing");
  const [adminAuth, setAdminAuth] = useState(false);
  const [modoAuthCliente, setModoAuthCliente] = useState("login");
  const viewRef = useRef(view);
  viewRef.current = view;
  const {
    pedidos, savePedidos, cadetes, saveCadetes, locales, saveLocales,
    productos, saveProductos, pedidoItems, crearPedidoConCarrito, crearPedidoDirecto,
    config, saveConfig, actualizarPedido, loaded,
  } = useStorage();

  // Integra el botón "atrás" físico/gesto del celular con la navegación interna,
  // para que no cierre la app de golpe sino que vuelva a la pantalla de inicio.
  useEffect(() => {
    const handlePopState = () => {
      if (viewRef.current !== "landing") {
        setView("landing");
        setModoAuthCliente("login");
        setAdminAuth(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const irA = (v) => {
    window.history.pushState({ andaView: v }, "", "");
    setView(v);
  };
  const volver = () => window.history.back();

  if (!loaded) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <div style={{ color: COLORS.muted, fontFamily: "'Inter', sans-serif" }}>Cargando...</div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      {view === "landing" && <Landing setView={irA} onCrearCuenta={() => { setModoAuthCliente("signup"); irA("cliente"); }} />}
      {view === "cliente" && <VistaCliente cadetes={cadetes} config={config} pedidos={pedidos} crearPedidoDirecto={crearPedidoDirecto} locales={locales} productos={productos} pedidoItems={pedidoItems} crearPedidoConCarrito={crearPedidoConCarrito} onBack={volver} modoAuthInicial={modoAuthCliente} />}
      {view === "cadete" && <VistaCadete cadetes={cadetes} pedidos={pedidos} actualizarPedido={actualizarPedido} onBack={volver} />}
      {view === "admin" && !adminAuth && (
        <AdminLogin onSuccess={() => setAdminAuth(true)} onBack={volver} />
      )}
      {view === "admin" && adminAuth && (
        <AdminApp pedidos={pedidos} savePedidos={savePedidos} cadetes={cadetes} saveCadetes={saveCadetes} locales={locales} saveLocales={saveLocales} productos={productos} saveProductos={saveProductos} pedidoItems={pedidoItems} config={config} saveConfig={saveConfig} onSalir={() => { supabase.auth.signOut(); setAdminAuth(false); volver(); }} />
      )}
    </div>
  );
}
