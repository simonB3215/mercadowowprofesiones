import React from 'react';
import { PageHead } from '../lib.js';
import { ShieldCheck } from '@phosphor-icons/react';

/** Qué guarda la web y cómo borrarlo. Debe coincidir con lo que hace el código (battlenet.ts, auth.ts y el almacenamiento local). */
export function Privacy() {
  return (
    <div className="prose">
      <PageHead title="Privacidad" icon={<ShieldCheck size={26} aria-hidden="true" />}>
        Qué datos guarda esta web, para qué y cómo borrarlos.
      </PageHead>

      <section className="card">
        <h2>Si conectas Battle.net</h2>
        <ul>
          <li><strong>Nunca vemos tu contraseña.</strong> Inicias sesión en la página oficial de Blizzard (oauth.battle.net) y Blizzard nos da un permiso de solo lectura de tu perfil de WoW (<code>wow.profile</code>).</li>
          <li><strong>El permiso de acceso</strong> (token) se guarda cifrado (AES-256-GCM) en el servidor y caduca cuando lo indica Blizzard (como mucho 30 días). Tu navegador solo tiene una cookie con un identificador aleatorio (<code>mw_bnet</code>), protegida para que el código de la página no pueda leerla.</li>
          <li><strong>Lo que se guarda de tu cuenta:</strong> tu BattleTag y región; de tus personajes, nombre, nivel, raza, clase, facción, hermandad, enlaces al retrato de Blizzard, equipo puesto y profesiones; y las rutas y el progreso que guardes.</li>
          <li><strong>Para qué:</strong> mostrar tu ficha y calcular rutas desde tu nivel. Cada cuenta solo puede ver y modificar sus propios personajes. No se comparte con nadie ni se usa para publicidad.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Cómo desconectar y borrar tus datos</h2>
        <p>En <a href="#/personaje">Mi personaje</a>:</p>
        <ul>
          <li><strong>«Desconectar»</strong> borra el permiso de acceso y cierra la sesión. Tus personajes guardados se conservan por si vuelves a conectar.</li>
          <li><strong>«Desconectar y borrar mis datos»</strong> borra además tu cuenta, personajes, profesiones, rutas y progreso de esta web. No se puede deshacer.</li>
        </ul>
        <p className="small muted">También puedes retirar el permiso desde tu cuenta de Battle.net, en las aplicaciones autorizadas.</p>
      </section>

      <section className="card">
        <h2>En tu navegador</h2>
        <ul>
          <li>Preferencias guardadas solo en tu navegador: casa de subastas elegida, perfil manual seleccionado, borrador del plan de fabricación, precios manuales de la subida de nivel y qué novedades del changelog ya viste.</li>
          <li>Si la web tiene contraseña de acceso, una cookie recuerda que ya la escribiste.</li>
          <li>No hay analítica, publicidad ni cookies de terceros.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Servicios que intervienen</h2>
        <ul>
          <li><strong>Blizzard</strong>: inicio de sesión, perfil, retratos, catálogo y precios de la casa de subastas. El retrato y los iconos se cargan desde sus servidores.</li>
          <li><strong>Wowhead</strong>: iconos de objetos y datos de recetas (las imágenes se cargan desde wow.zamimg.com).</li>
          <li><strong>TradeSkillMaster</strong>: estadísticas regionales de precios.</li>
          <li><strong>Vercel</strong> (alojamiento de la web) y <strong>Supabase</strong> (base de datos).</li>
        </ul>
      </section>

      <p className="small muted">
        Web de fans sin relación con Blizzard Entertainment. World of Warcraft y Battle.net son marcas de Blizzard Entertainment, Inc.
      </p>
    </div>
  );
}
