import { createConnection } from 'node:net'
import type { Socket } from 'node:net'

export interface PubMedCredentials {
  ftpHost:     string
  ftpUsername: string
  ftpPassword: string
  ftpPath?:    string
}

// Minimal async FTP client (PASV mode) — no external dependencies.
class FtpClient {
  private sock!: Socket
  private _buf = ''

  connect(host: string, port = 21): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sock = createConnection(port, host)
      this.sock.setEncoding('ascii')
      this.sock.once('error', reject)
      this.waitCode(220).then(() => resolve()).catch(reject)
    })
  }

  // Accumulate data and resolve once a terminal response line (NNN<space>) is seen.
  // Multi-line continuations (NNN-) are skipped.
  waitCode(code: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.sock.removeListener('data', handler)
        reject(new Error(`FTP timeout waiting for ${code}`))
      }, 15_000)

      const handler = (chunk: string) => {
        this._buf += chunk
        for (;;) {
          const nl = this._buf.indexOf('\n')
          if (nl === -1) break
          const line = this._buf.slice(0, nl).trimEnd()
          this._buf = this._buf.slice(nl + 1)
          if (/^\d{3}-/.test(line)) continue          // multiline continuation
          const got = Number(line.slice(0, 3))
          clearTimeout(timeout)
          this.sock.removeListener('data', handler)
          if (got === code) resolve(line)
          else reject(new Error(`FTP: expected ${code}, got ${got}: ${line.slice(4)}`))
          return
        }
      }
      this.sock.on('data', handler)
    })
  }

  async cmd(command: string, expectCode: number): Promise<string> {
    this.sock.write(command + '\r\n')
    return this.waitCode(expectCode)
  }

  async upload(filename: string, data: Buffer): Promise<void> {
    await this.cmd('TYPE I', 200)
    const pasvLine = await this.cmd('PASV', 227)
    const m = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(pasvLine)
    if (!m) throw new Error(`Cannot parse PASV response: ${pasvLine}`)
    const dataHost = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`
    const dataPort = Number(m[5]) * 256 + Number(m[6])

    await new Promise<void>((resolve, reject) => {
      const dSock = createConnection(dataPort, dataHost, () => {
        this.sock.write(`STOR ${filename}\r\n`)
        this.waitCode(150)
          .then(() => { dSock.end(data) })
          .catch(reject)
      })
      dSock.once('error', reject)
      dSock.once('close', () => {
        this.waitCode(226).then(() => resolve()).catch(reject)
      })
    })
  }

  async quit(): Promise<void> {
    this.sock.write('QUIT\r\n')
    await new Promise(resolve => this.sock.once('close', resolve))
  }
}

export async function depositToPubMed(
  jatsXml: string,
  filename: string,
  creds: PubMedCredentials,
): Promise<void> {
  const ftp = new FtpClient()
  await ftp.connect(creds.ftpHost)
  await ftp.cmd(`USER ${creds.ftpUsername}`, 331)
  await ftp.cmd(`PASS ${creds.ftpPassword}`, 230)
  if (creds.ftpPath) await ftp.cmd(`CWD ${creds.ftpPath}`, 250)
  await ftp.upload(filename, Buffer.from(jatsXml, 'utf8'))
  await ftp.quit()
}
