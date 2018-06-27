function openDatabase() {
	if (!navigator.serviceWorker) return Promise.resolve();
	return idb.open('currency-converter', 1, upgradeDB => upgradeDB.createObjectStore('currencies'));
}

class CurrencyConverter {

	constructor() {
		this.initOnChange = false;
		this.initOnKeyPress = false;

		this.currencies = null;

		this.deferredPrompt = null;

		this.dbPromise = openDatabase();

		this.initSelectors();
		this.fetchCurrencies();
		this.initInputs();
		this.registerServiceWorker();
		this.initToasts();
		this.initInstallPrompt();

		this.onChange = this.onChange.bind(this);
		this.onInput = this.onInput.bind(this);
	}

	registerServiceWorker() {
		if (!navigator.serviceWorker) return;

		navigator.serviceWorker.register('/sw.js').then(reg => {
			if (!navigator.serviceWorker.controller) return;

			if (reg.waiting) {
				this.updateReady(reg.waiting);
				return;
			}

			if (reg.installing) {
				this.trackInstalling(reg.installing);
				return;
			}

			reg.addEventListener('updatefound', () => this.trackInstalling(reg.installing));
		});

		let refreshing;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if(refreshing) return;
			window.location.reload();
			refreshing = true;
		})
	}

	updateReady(worker) {
		const toast = M.toast({
			html: `<span>New version available.</span><button class="btn-flat toast-update">Refresh</button>`,
			displayLength: 1000 * 1000 * 1000
		});

		$('.toast-update').click(event => {
			event.preventDefault();
			worker.postMessage({action: 'skipWaiting'});
		});

	}

	trackInstalling(worker) {
		worker.addEventListener('statechange', () => {
			if (worker.state === 'installed') {
				this.updateReady(worker);
			}
		});
	}

	initSelectors() {
		$('.currency-selector').formSelect();
		if (!this.initOnChange) {
			$('.currency-selector').on('change', event => this.onChange(event));
			this.initOnChange = true;
		}
	}

	initInputs() {
		if (!this.initOnKeyPress) {
			$('.currency-input').on('keypress, keyup', event => this.onInput(event));
			this.initOnKeyPress = true;
		}
	}

	fetchCurrencies() {
		this.dbPromise.then(db => {
			let store = db.transaction('currencies').objectStore('currencies');
			store.getAll()
				.then(currencies => {
					if (currencies.length === 0) {
						fetch('https://free.currencyconverterapi.com/api/v5/currencies')
						.then(response => response.json())
						.then(({results}) => {
							if (results) {
								const currencies = [];
								store = db.transaction('currencies', 'readwrite').objectStore('currencies');
								Object.keys(results).map(key => {
									store.put(results[key], key);
									currencies.push(results[key]);
								});
								this.renderCurrencies(currencies);
							}
						});
					}
					this.renderCurrencies(currencies);
				})
		});
	}

	renderCurrencies(currencies) {
		if (currencies) {
			this.currencies = currencies;
			currencies.sort((a, b) => a.currencyName < b.currencyName ? -1 : a.currencyName > b.currencyName ? 1 : 0);
			currencies.map(currency => $('.currency-selector').append(`<option value="${currency.id}">${currency.currencyName}</option>`));
			this.initSelectors();
		}
	}

	fetchRate(src, tgt) {
		return fetch(`https://free.currencyconverterapi.com/api/v5/convert?q=${src}_${tgt}&compact=ultra`)
			.then(response => response.json());
	}

	onChange(event) {
		const src_input = $('#src-input');
		const tgt_input = $('#tgt-input');
		const src_currency = $('#src-selector').val();
		const tgt_currency = $('#tgt-selector').val();

		switch(event.target.id) {
			case 'src-selector':
				if (!this.validateRequest({input: src_input, selector1: tgt_currency})) return;
				this.fetchRate(event.target.value, tgt_currency)
					.then(response => this.handleResponse({response: response, multiplier: src_input, destination: tgt_input}));
				break;
			case 'tgt-selector':
				if (!this.validateRequest({input: src_input, selector1: src_currency})) return;
				this.fetchRate(src_currency, event.target.value)
					.then(response => this.handleResponse({response: response, multiplier: src_input, destination:tgt_input}));
				break;
		}
	}

	onInput(event) {
		const src_input = $('#src-input');
		const tgt_input = $('#tgt-input');

		let src_currency, tgt_currency = null;

		switch(event.target.id) {
			case 'src-input':
				src_currency = $('#src-selector').val();
				tgt_currency = $('#tgt-selector').val();

				if(!this.validateRequest({input: src_input, selector1: src_currency, selector2: tgt_currency})) {
					tgt_input.val('');
					return;
				}

				this.fetchRate(src_currency, tgt_currency)
					.then(response => this.handleResponse({response: response, multiplier: src_input, destination: tgt_input}));
				break;
			case 'tgt-input':
				src_currency = $('#tgt-selector').val();
				tgt_currency = $('#src-selector').val();
				if(!this.validateRequest({input: tgt_input, selector1: src_currency, selector2: tgt_currency})) {
					src_input.val('');
					return;
				}

				this.fetchRate(src_currency, tgt_currency)
					.then(response => this.handleResponse({response: response, multiplier: tgt_input , destination: src_input }));
				break;
		}
	}

	validateRequest({input, selector1=true, selector2=true}) {
		if (input.val().length === 0) return false;

		if (!selector1) return false;

		if (!selector2) return false;

		return true;
	}

	handleResponse({response, multiplier, destination}) {
		if (Object.keys(response).length === 0 && response.constructor === Object) return;

		const key = Object.keys(response)[0];
		const amount = multiplier.val().length === 0 ? '' : response[key] * multiplier.val();
		destination.val(amount);
		
		this.updateLabels();
	}

	updateLabels() {
		const src_amount = $('#src-input').val();
		const tgt_amount = $('#tgt-input').val();
		const src_name = $('#src-selector option:selected').text();
		const tgt_name = $('#tgt-selector option:selected').text();

		if (src_amount.length === 0 || tgt_amount.length === 0 || src_name === '' || tgt_name === '') {
			return;			
		}

		$('#src-amount').html(src_amount);
		$('#src-name').html(src_name);
		$('#tgt-amount').html(tgt_amount);
		$('#tgt-name').html(tgt_name);

		$('.card-content__header').removeClass('hidden');
	}

	initToasts() {
		if (!navigator.onLine){
			this.displayOfflineToast();
		}
		window.addEventListener('offline', () => {
			this.displayOfflineToast();
		});
		window.addEventListener('online', () => {
			this.dismissToast('.toast');
		});
	}

	displayOfflineToast() {
		const toast = M.toast({html: 'Unable to connect. Retrying...', 'displayLength': 1000 * 1000 * 1000});
	}

	initInstallPrompt() {
		window.addEventListener('beforeinstallprompt', event => {
			event.preventDefault();
			this.deferredPrompt = event;

			const toast = M.toast({
				html: `<span>Convert currencies on the go.</span><button class="btn-flat toast-install">Add to Home screen</button>`,
				displayLength: 10000
			});

			$('.toast-install').click(e => {
				e.preventDefault();
				this.dismissToast('.toast');
				this.deferredPrompt.prompt();
				this.deferredPrompt.userChoice.then((result) => {
					this.deferredPrompt = null;
				});
			});
		});
	}

	dismissToast(selector) {
		const toastElement = document.querySelector(selector);
		const toastInstance = M.Toast.getInstance(toastElement);
		toastInstance.dismiss();
	}

}

$(document).ready(() => {
	new CurrencyConverter();
});