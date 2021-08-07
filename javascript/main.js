let api = atob('aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J5SXhQbzkzQ0JIeWpWVklKeG9Id05MekpaR2FWRFZWaExYY3VyaU1lOU1zWDZ4U1FKMmRQcGtsRFZ1alpmeERJNEcvZXhlYw==');
let uri = window.location.href.split("#")[0];
let hash = window.location.href.split("#")[1];
let elem = document.getElementById("loader");
if (hash) {
    for (let elem of document.getElementsByClassName("form-group")) {
        elem.style.display = "none";
    };
    elem.style.display = "block";
    fetch(`${api}?query=${hash}`)
        .then(res => res.json())
        .then(j => {
            window.location.href = ((j.result == "") ? uri : j.result);
        });
} else {
    elem.style.display = "none";
}

let btn = document.getElementById('btn');
let inp = document.getElementById('url');
let ali = document.getElementById('alias');
let rec = document.getElementById('recaptcha');
let res = document.getElementById('result');

inp.addEventListener('input', () => {
    rec.style.display = ali.style.display = ((inp.value.startsWith("http")) ? "block" : "none");
});

btn.addEventListener('click', () => {
    elem.style.display = "block";
    $.post(api, { url: inp.value, alias: (ali.value == "" ? undefined : ali.value) }, data => { res.innerText = `${uri}#${data.result}`; elem.style.display = "none"; }, 'json');
});

// GET IP
var uriIP = 'https://www.cloudflare.com/cdn-cgi/trace';
var ip;
fetch(uriIP)
    .then(response => response.text())
    .then(result => {
        var resultArr = result.split('\n');
        for (var i = 0, len = resultArr.length; i < len; i++) {
            var tempArr = resultArr[i].split('=');
            if (tempArr[0] == 'ip') {
                ip = tempArr[1];
                break;
            }
        }
    })
    .catch(err => {
        window.alert(err)
    });

// reCAPTCHA

function verifyCallback(token) {
    var formData = new FormData();
    formData.append('token', token);
    formData.append('ip', ip);

    // Google Apps Script 部署為網路應用程式後取得的 URL
    var uriGAS = "https://script.google.com/macros/s/AKfycbymUjNyL3y34V1P1eAAS0Nli3jV7JxlLR-QYE-eKoXLMbKI3tTAHO4RI91vtyGD3Nke/exec";

    fetch(uriGAS, {
        method: "POST",
        body: formData
    }).then(response => response.json())
        .then(result => {
            if (result.success) {
                // 後端驗證成功，success 會是 true
                // 這邊寫驗證成功後要做的事
                document.getElementById('btn').classList.remove('none');
            } else {
                // success 為 false 時，代表驗證失敗，error-codes 會告知原因
                window.alert(result['error-codes'][0])
            }
        })
        .catch(err => {
            window.alert(err)
        })
}

// Backspace

var TxtRotate = function (el, toRotate, period) {
    this.toRotate = toRotate;
    this.el = el;
    this.loopNum = 0;
    this.period = parseInt(period, 10) || 2000;
    this.txt = '';
    this.tick();
    this.isDeleting = false;
};

TxtRotate.prototype.tick = function () {
    var i = this.loopNum % this.toRotate.length;
    var fullTxt = this.toRotate[i];

    if (this.isDeleting) {
        this.txt = fullTxt.substring(0, this.txt.length - 1);
    } else {
        this.txt = fullTxt.substring(0, this.txt.length + 1);
    }

    this.el.innerHTML = '<span class="wrap">' + this.txt + '</span>';

    var that = this;
    // var delta = 200 - Math.random() * 100;

    var delta = 200;
    if (this.isDeleting) { delta /= 2; }

    if (!this.isDeleting && this.txt === fullTxt) {
        delta = this.period;
        this.isDeleting = true;
    } else if (this.isDeleting && this.txt === '') {
        this.isDeleting = false;
        this.loopNum++;
        delta = 500;
    }

    setTimeout(function () {
        that.tick();
    }, delta);
};

window.onload = function () {
    var elements = document.getElementsByClassName('txt-rotate');
    for (var i = 0; i < elements.length; i++) {
        var toRotate = elements[i].getAttribute('data-rotate');
        var period = elements[i].getAttribute('data-period');
        if (toRotate) {
            new TxtRotate(elements[i], JSON.parse(toRotate), period);
        }
    }
    // INJECT CSS
    var css = document.createElement("style");
    css.type = "text/css";
    css.innerHTML = ".txt-rotate > .wrap { border-right: 0.08em solid #666 }";
    document.body.appendChild(css);
};


