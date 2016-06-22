'use strict'

const co = require('co')
const html2text = require('html-to-text').fromString
const proxy = require('superagent-proxy')
const request = proxy(require('superagent'))
const promisify = require('superagent-promise-plugin')

const baseUrl = 'http://www.xicidaili.com/nn/'
    , rangeFirst = 1, rangeLast = 20
    , timeout = 10000
    , probeUrl = 'http://www.sina.com.cn/'
    , probeVerify = (res) => res.statusCode == 200

const userAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) Chrome/51.0.2704.84'

const stderr = (s) => process.stderr.write(s+'\n')

// => {addr, port, priority}
const determinePriority = (addr, port, type='http') => 
    new Promise( (resolve, reject)=>{
        const proxyStr = `${type}://${addr}:${port}`
        let start = (new Date()).getTime()
        
        request
        .get(probeUrl)
        .set('User-Agent', userAgent)
        .set('Accept', 'text/html,application/json,*/*')
        .timeout(timeout)
        .proxy(proxyStr)
        .use(promisify)
        .catch( (err)=>{
            stderr(`${proxyStr}, fail: ${err.message}`)
            resolve(null)
        })
        .then( (res)=>{
            let end = (new Date()).getTime()
            if (!probeVerify(res)) {
                stderr(`${proxyStr}, fail: req_auth?`)
                resolve(null)
            }else{
                stderr(`${proxyStr}, success`)
                resolve({
                    addr:     addr,
                    port:     port,
                    priority: end - start
                })
            }
        })
} )

function extractProxies(res) {
    if (res.status !== 200) {
        stderr(`Fail to fetch proxy list, status: ${res.status}`)
        return []
    }
    
    // expand speed / connection time to text values for extraction
    res.text = res.text.replace(/style="width:(\d+)%">\s*</g, '>$1<')
    
    let table = html2text(res.text, {
        tables :     ['#ip_list'],
        baseElement: ['table#ip_list'],
        wordwrap:    null,
        ignoreHref:  true,
        ignoreImage: true
    })
    
    return table.split(/[\n\r]+/).slice(1).map( ln=>{
        let cell = ln.split(/\s{2,}/)
        return {
            addr:  cell[1],
            port:  cell[2],
            anno:  cell[4],
            type:  cell[5],
            speed: cell[6],
            ctime: cell[7],
            etime: cell[8]
        }
    })
}

co(function*(){
    let list = []
    for (let i=rangeFirst; i<=rangeLast; ++i) {
        let res = yield request
                        .get(`${baseUrl}${i}`)
                        .use(promisify)
        
        let entry = (yield Promise.all(
            extractProxies(res)
            .map( $=>determinePriority($.addr, $.port) )
        ))
        
        list.push( ...entry.filter($=>$!==null) )
    }
    return list
})
.catch( (err)=> {
    stderr(err)
})
.then( (res) => {
    process.stdout.write(JSON.stringify(res, null, '  '))
})

process.on('uncaughtException', function (err) {
  stderr(`uncaucht: ${err.message}`);
})