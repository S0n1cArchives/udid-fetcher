import { json } from 'body-parser';
import btoa from 'btoa';
import atob from 'atob';
import { Request, Response, Router as app } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { build, parse, PlistValue } from 'plist';
import { v4 } from 'uuid';
import fetch from 'node-fetch';

import { getSignedConfig } from 'mobileconfig';

import { format, URL } from 'url';
import BaseStore from './BaseStore';


export interface DeviceData {
	name: string,
	boardconfig: string,
	platform: string,
	cpid: number,
	bdid: number,
	model: string,
	udid: string,
	ios: {
		version: string,
		build: string,
		fixVersion?: boolean,
		signed?: boolean
	}
}

interface WithRaw extends Request {
	rawBody: any
}

export interface DeviceRequest extends Request {
	device: DeviceData
}

export interface MC {
	PayloadContent: {
		URL: string
		DeviceAttributes: string[]
	}
	PayloadOrganization: string
	PayloadDisplayName: string
	PayloadVersion: string
	PayloadUUID: string
	PayloadIdentifier: string
	PayloadDescription: string
	PayloadType: string
}

export interface SigningConfig {
	key: string
	cert: string
}

export interface UDIDFetcherOptions {
	name: string
	organization: string
	description: string
	identifier: string
	apiURL: string
	signing?: SigningConfig
	query?: {
		[k: string]: string
	},
	// eslint-disable-next-line no-unused-vars
	done: (req: DeviceRequest, res: Response) => void
}

interface IPSWRes {
	name: string
	identifier: string
	boardconfig: string
	platform: string
	cpid: number
	bdid: number
	firmwares: {
		identifier: string
		version: string
		buildid: string
		sha1sum: string
		md5sum: string
		filesize: number
		url: string
		releasedate: string
		uploaddate: string
		signed:boolean
	}[]
}

class Devices extends BaseStore<string, DeviceData> {}
class FlowIds extends BaseStore<string, string> {
	make(id: string): string {
		this.set(id, id);
		return id;
	}
}
export class UDIDFetcher {
	router = app()
	private _data: UDIDFetcherOptions
	private _devices = new Devices()
	private _flow_ids = new FlowIds()
	constructor(options: UDIDFetcherOptions) {
		Object.defineProperty(this, '_data', {
			value: options,
			configurable: true,
			writable: true
		});

		this.init();
	}

	initConfigs():void {
		this.router.use((req: WithRaw, res, next) => {
			req.rawBody = '';
			req.setEncoding('utf8');

			req.on('data', (chunk) => {
				req.rawBody += chunk;
			});

			req.on('end', () => {
				next();
			});
		});

		this.router.use(json());
	}

	async request<T>(url: string, type?: 'json' | 'buffer' | 'text' | 'arraybuffer'): Promise<string | T | Buffer | ArrayBuffer> {
		const res = await fetch(url);
		if (!res.ok) {
			throw res;
		}
		if (typeof type === 'undefined') {
			type = 'json';
		}
		switch (type) {
			case 'arraybuffer':
				return res.arrayBuffer();
			case 'buffer':
				return res.buffer();
			case 'text':
				return res.text();
			case 'json':
				return res.json() as Promise<T>;
		}
	}

	async getDevice(model: string): Promise<IPSWRes> {
		const res = await this.request<IPSWRes>(`https://api.ipsw.me/v4/device/${model}?type=ipsw`);
		return res as IPSWRes;
	}

	getVersion(results: IPSWRes, build: string): string {
		const find = results.firmwares.find(f => f.buildid === build);
		if (typeof find !== 'undefined') {
			return results.firmwares.find(f => f.buildid === build).version;
		}
		return null;
	}

	getSigningStatus(results: IPSWRes, build: string): boolean {
		const find = results.firmwares.find(f => f.buildid === build);
		if (typeof find === 'undefined') {
			return results.firmwares.find(f => f.buildid === build).signed;
		}
		return null;
	}

	genString(length = 10): string {
		var result           = '';
		var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for (var i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}

	async signConfig(config: MC): Promise<Buffer> {
		const { signing } = this._data;
		return new Promise((resolve, reject) => getSignedConfig(config, signing, (err, data) => err ? reject(err) : resolve(data)));
	}

	initRoutes(): void {
		this.router.get('/enroll', async (req, res) => {
			let config = readFileSync(join(__dirname, '..', 'enrollment.mobileconfig'), 'utf-8');
			const xml: MC = parse(config) as unknown as MC;
			const api_url = new URL(this._data.apiURL);
			api_url.pathname = join(api_url.pathname, 'confirm');
			const flow_id = this._flow_ids.make(this.genString());
			api_url.searchParams.append('flow_id', flow_id);
			if (typeof this._data.query !== 'undefined') {
				for (const k of Object.keys(this._data.query)) {
					api_url.searchParams.append(k, this._data.query[k]);
				}
			}
			for (const k of Object.keys(req.query)) {
				api_url.searchParams.append(k, req.query[k] as string);
			}

			xml.PayloadContent.URL = `${api_url.toString()}`;
			xml.PayloadUUID = v4().toUpperCase();
			xml.PayloadIdentifier = this._data.identifier;
			xml.PayloadDisplayName = this._data.name;
			xml.PayloadOrganization = this._data.organization;
			xml.PayloadDescription = this._data.description;

			if (typeof this._data.signing !== 'undefined') {
				const newconfig = await this.signConfig(xml);
				return res.set({
					'content-type': 'application/x-apple-aspen-config; chatset=utf-8',
					'Content-Disposition':  'attachment; filename="enrollment.mobileconfig"'
				}).send(newconfig);
			}


			config = build(xml as unknown as PlistValue);


			//	res.set('content-type', 'application/xml').send(config);

			res.set({
				'content-type': 'application/x-apple-aspen-config; chatset=utf-8',
				'Content-Disposition':  'attachment; filename="enrollment.mobileconfig"'
			}).send(config);
		});

		this.router.post('/confirm', (req: WithRaw, res) => {
			var rawdata = req.rawBody;
			if (typeof rawdata === 'undefined') {
				throw 'failed to get rawdata';
			}


			var data = parse(rawdata);

			const api_url = new URL(this._data.apiURL);
			api_url.pathname = join(api_url.pathname, 'enrollment');
			api_url.searchParams.append('data', btoa(JSON.stringify(data)));
			for (const k of Object.keys(req.query)) {
				api_url.searchParams.append(k, req.query[k] as string);
			}

			return res.redirect(301, `${format(api_url)}`);
		});

		this.router.get('/enrollment', async (req: DeviceRequest, res) => {
			/*
			 * if (!req.headers['user-agent'].includes('Profile')) {
			 * 	console.log('Invalid enrollment request.');
			 * 	return res.redirect('/');
			 * }
			 */
			if (typeof req.query.data !== 'undefined' && req.headers['user-agent'].includes('Profile')) {
				const data = JSON.parse(atob(req.query.data as string));

				var arr: DeviceData;

				try {
					var results = await this.getDevice(data.PRODUCT);
				} catch (e) {
					res.send(e);
					return;
				}
				arr = {
					name: results.name,
					boardconfig: results.boardconfig,
					platform: results.platform,
					cpid: results.cpid,
					bdid: results.bdid,
					udid: data.UDID,
					model: data.PRODUCT,
					ios: {
						build: data.VERSION,
						version: this.getVersion(results, data.VERSION),
						signed: this.getSigningStatus(results, data.VERSION)
					}
				};

				const id = this.genString();
				this._devices.set(id, arr);
				const api_url = new URL(this._data.apiURL);
				api_url.pathname = join(api_url.pathname, 'final');
				api_url.searchParams.append('id', id);
				for (const k of Object.keys(req.query)) {
					api_url.searchParams.append(k, req.query[k] as string);
				}
				return res.redirect(301, `${api_url.toString()}`);
			}
		});

		this.router.get('/final', async (req: DeviceRequest, res) => {
			if (typeof req.query.id !== 'undefined' && this._flow_ids.has(req.query.flow_id as string)) {
				if (!req.headers['user-agent'].includes('Profile')) {
					const device = this._devices.get(req.query.id as string);
					req.device = device;
					this._flow_ids.delete(req.query.flow_id as string);
					return this._data.done(req, res);
				}
				return res.end();
			}
		});
	}

	init(): void {
		this.initConfigs();
		this.initRoutes();
	}
}
