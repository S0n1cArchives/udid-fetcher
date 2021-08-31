declare module 'mobileconfig' {
	interface MC {
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

	// eslint-disable-next-line no-unused-vars
	function getSignedConfig(plistData: MC, keys: {key: string, cert: string}, callback: (err: any, data: Buffer) => void): void
}
