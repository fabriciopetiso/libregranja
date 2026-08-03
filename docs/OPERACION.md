# Operación

Cómo se levanta, se para y se respalda Libregranja mientras corre en una
máquina propia. Todo esto vale igual el día que se mude a un servidor.

## El servicio

Corre como servicio de usuario de systemd. Arranca solo al prender la máquina,
se reinicia solo si se cae, y no necesita que haya una terminal abierta.

```bash
systemctl --user status libregranja     # cómo está
systemctl --user restart libregranja    # reiniciar
systemctl --user stop libregranja       # parar
journalctl --user -u libregranja -f     # ver qué está haciendo
```

Definición en `~/.config/systemd/user/libregranja.service`.

`loginctl enable-linger` está activado: el servicio sigue corriendo aunque
cierres la sesión gráfica. Sin eso, cerrar sesión mataría la app y nadie en la
granja podría cargar.

## Dónde están los datos

Un solo archivo:

```
/home/altertecno/pm/Libregranja/datos/libregranja.db
```

Se copia a un pendrive y se llevó la granja entera. No hay nada en la nube.

## Copias de seguridad

Todos los días a las 22, por cron, en `~/copias-libregranja/`. Se guardan 30
días.

```bash
libregranja-backup      # hacer una ahora
ls ~/copias-libregranja/
```

Usa el `.backup` de SQLite, que copia en caliente: no frena la app ni deja un
archivo a medio escribir. Copiar el `.db` con `cp` mientras alguien carga puede
producir una copia corrupta que sólo se descubre el día que hace falta.

**Restaurar** es parar el servicio, copiar el archivo encima y volver a
arrancar:

```bash
systemctl --user stop libregranja
cp ~/copias-libregranja/libregranja_2026-08-03.db datos/libregranja.db
systemctl --user start libregranja
```

Las copias viven en el mismo disco que el original. Eso protege de un error de
carga, no de que se rompa el disco: conviene que algo las lleve afuera.

## Entrar desde otro dispositivo

Los teléfonos en la misma red entran a `http://<ip-de-la-máquina>:8787`.

Hay que abrir el puerto una vez:

```bash
sudo ufw allow from 192.168.18.0/24 to any port 8787 proto tcp
```

Sólo para la red local, no para internet.

Por HTTP la app funciona completa, pero **no se puede instalar en la pantalla
de inicio**: Android exige HTTPS para eso. Se resuelve solo el día que haya un
dominio con certificado.

## Después de tocar el código

```bash
npm test && npm run typecheck   # que no se rompió nada
npm run build                   # recompilar el front
systemctl --user restart libregranja
```

El front se sirve desde `dist/web`. Sin `npm run build`, los cambios de
pantalla no se ven aunque el servidor se reinicie.
