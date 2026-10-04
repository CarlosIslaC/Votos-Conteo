// =====================================================================
//  CONFIG — Conteo Rápido PACASMAYO (distrito)
//  Este es el ÚNICO archivo que se edita. Después de cambiarlo, vuelve a subir la carpeta.
// =====================================================================
const CONFIG = {
  nombre: "Elecciones Municipales 2026 — Alcalde distrital de Pacasmayo",
  ubicacion: { departamento: "La Libertad", provincia: "Pacasmayo", distrito: "Pacasmayo" },
  eleccion: "La Libertad|Pacasmayo|Pacasmayo",      // llave en la nube (NO cambiar)
  totalMesas: 0,                                     // ← total de mesas del distrito (0 = aún no definido)

  // ---- NUBE (Supabase): Project Settings → API ----
  supabase: {
    url: "https://wqcndkiqjhpybqdbozsh.supabase.co",             // ← Project URL
    key: "sb_publishable_XVVn4211-9xvWx2DZaXIEw_f8J5qsez"                      // ← anon public key
  },

  // ---- IA para leer actas (Gemini, gratis en aistudio.google.com/apikey) ----
  ia: {
    // Las claves de IA (Gemini, OpenRouter o Claude) se ponen en Admin → Estado → «Claves de IA»: se guardan en la nube y llegan
    // solas a todos los celulares, sin volver a subir archivos. Aquí puedes dejar claves de respaldo
    // ("clave1", "clave2"), pero este archivo es público: evita subirlo con claves a un GitHub público.
    keys: [],
    modelo: "gemini-3.8-flash",                       // modelo principal; si se satura, la app prueba otros solo
    modelos: ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-pro-latest"]                                       // opcional: lista de modelos permitidos (vacío = automático)
  },

    // ---- Candidatos a ALCALDE DISTRITAL de Pacasmayo, EN EL ORDEN DEL ACTA DE ESCRUTINIO ----
  // Es el mismo orden en que los ve el personero en la app: si no coinciden, la gente se equivoca
  // al pasar los numeros. No lo cambies sin cambiar tambien el acta.
  partidos: [
    {
        "sigla": "APP",
        "nombre": "Alianza para el Progreso",
        "candidato": "Carlos Enrique Vigo Castañeda",
        "color": "#e5484d"
    },
    {
        "sigla": "SAP",
        "nombre": "Salvemos al Peru",
        "candidato": "Dennis Sanchez Sisniegas",
        "color": "#d8742f"
    },
    {
        "sigla": "RP",
        "nombre": "Renovacion Popular Peru",
        "candidato": "Jhenner Jhandir Cespedes Plasencia",
        "color": "#2596c9"
    },
    {
        "sigla": "FEP",
        "nombre": "Fe en el Peru",
        "candidato": "Cesar Rodolfo Milla Manay",
        "color": "#c9812e"
    },
    {
        "sigla": "PRIN",
        "nombre": "Partido Politico Prin",
        "candidato": "Hugo Denis Olano Mendoza",
        "color": "#7f72e6"
    },
    {
        "sigla": "UCD",
        "nombre": "Un Camino Diferente",
        "candidato": "Jorge Luis Pinillos Correa",
        "color": "#2fa845"
    },
    {
        "sigla": "SP",
        "nombre": "Partido Democratico Somos Peru",
        "candidato": "Elmer Kennedy Albitres Leon",
        "color": "#26a889"
    },
    {
        "sigla": "APRA",
        "nombre": "Partido Aprista Peruano",
        "candidato": "Mario Arturo Alegria Pastor",
        "color": "#d6409f"
    },
    {
        "sigla": "PP",
        "nombre": "Podemos Peru",
        "candidato": "Jose Manuel Cabanillas Cabanillas",
        "color": "#4d8ef0"
    }
],

  // Referencia: candidatos a alcalde PROVINCIAL de Pacasmayo (no se usan por ahora)
  provincial: [
    {
        "sigla": "APP",
        "nombre": "Alianza para el Progreso",
        "candidato": "Cesar Augusto Chavez Paz",
        "color": "#e5484d"
    },
    {
        "sigla": "FEP",
        "nombre": "Fe en el Peru",
        "candidato": "Katherine Patricia Tapia Huertas",
        "color": "#c9812e"
    },
    {
        "sigla": "APRA",
        "nombre": "Partido Aprista Peruano",
        "candidato": "Alfonso Virgilio Purizaga Cruzado",
        "color": "#d6409f"
    },
    {
        "sigla": "SP",
        "nombre": "Partido Democratico Somos Peru",
        "candidato": "Victor Raul Cruzado Rivera",
        "color": "#26a889"
    },
    {
        "sigla": "PRIN",
        "nombre": "Partido Politico Prin",
        "candidato": "Carlos Alberto Grados Mendoza",
        "color": "#7f72e6"
    },
    {
        "sigla": "PP",
        "nombre": "Podemos Peru",
        "candidato": "Jhonatan Manuel Ventura Javier",
        "color": "#4d8ef0"
    }
]
};
