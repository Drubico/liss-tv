import TorControl, { type TorControlStatus } from "tor-control";

export const torControl = new TorControl({
  host: "127.0.0.1",
  port: 9051,
  persistent: true,
});

export async function changeTorIdentity(): Promise<TorControlStatus | null> {
  return new Promise((resolve, reject) => {
    console.log("🔄 Intentando cambiar la identidad de Tor...");
    torControl.signalNewnym((err, status) => {
      if (err) {
        console.error("❌ Error al cambiar la identidad de Tor:", err);
        return reject(err);
      }
      console.log("✅ Identidad de Tor cambiada con éxito:", status);
      resolve(status);
    });
  });
}
