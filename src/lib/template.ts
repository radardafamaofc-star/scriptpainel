export const DEFAULT_TEMPLATE = `✅ *Usuário:* {username}
✅ *Senha:* {password}
🎁 *Plano:* {package}
🔗 *Assinar/Renovar Plano:* {pay_url}
💰 *Valor do Plano:* {plan_price}
📅 *Vencimento:* {expires_at}
📊 *Conexões:* {connections}

🔴 *DNS XCIPTV:* {dns}
🔴 *DNS SMARTERS:* {dns}

🟢 *Link (M3U):* {dns}/get.php?username={username}&password={password}&type=m3u_plus&output=mpegts

🟢 *Link Curto (M3U):* http://e.{dns_host}/p/{username}/{password}/m3u

🟡 *Link (HLS):* {dns}/get.php?username={username}&password={password}&type=m3u_plus&output=hls

🟡 *Link Curto (HLS):* http://e.{dns_host}/p/{username}/{password}/hls

🔴 *Link (SSIPTV):* http://e.{dns_host}/p/{username}/{password}/ssiptv

📺 *DNS STB / SmartUp:* XXXXX

📺 *WebPlayer:* http://XXXXXX/

✅ *PARA ANDROID:*
- PLAYSTORE
- EM BREVE

✅ *App EM APK (LINK DIRETO):*
*DOWNLOAD:* https://bit.ly/XXXXX`;

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
