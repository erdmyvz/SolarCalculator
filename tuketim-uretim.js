/* ============================================================================
   tuketim-uretim.js — TÜKETİM & ÜRETİM ANALİZİ (ziyaretçi aracı)

   Konumdan 1 kWp'nin aylık üretimini, tüketimden saatlik yük profilini çıkarır;
   ikisini tipik günler üzerinden saat saat çakıştırıp optimum kurulu gücü,
   inverteri ve (kesinti yükleri + süreye göre) bataryayı önerir. Üretimden
   şebekeye kadar her kaybı ayrı ayrı gösterir. #tuketimUretimRoot içine
   kendini basar; DB'ye yazmaz.

   YAPI: önce saf hesap motoru (window.epcTuMotor — DOM'a dokunmaz, Node'da
   test edilebilir), sonra arayüz. Motor, kök düğüm yoksa da tanımlanır.

   ⚠️ SİTENİN DİĞER ARAÇLARIYLA TUTARLILIK: Panel gücü, kWp başı çatı alanı,
   batarya DoD/modül, inverter verimi, kWp fiyatı, kur ve tarifeler
   EPC_SETTINGS'ten — Fatura Analizi ve Batarya aracıyla aynı kaynaktan.
   Varsayılan kayıp zinciri (%13,2) PVGIS'in %14 varsayılanına yakın tutuldu;
   gölgelenme "yok" seçilince il verimi core.js'teki tabloyla ~%1 içinde.
   ============================================================================ */
(function () {
    'use strict';

    // --- VERİ: İL BAZINDA AYLIK ÜRETİM ------------------------------------------
    // KAYNAK: PVGIS v5.2 (AB Ortak Araştırma Merkezi) PVcalc — SARAH2 uydu verisi.
    //   Sorgu: peakpower=1 & loss=0 & optimalangles=1, konum: il sınır merkezi
    //   (il-verimleri-pvgis.json ile aynı nokta). Çekim: 01.10.2026.
    //   Ham yanıtlar: il-aylik-pvgis.json
    //
    // loss=0 BİLEREK: PVGIS'in tek kalemlik %14'ü yerine kayıpları kalem kalem
    // göstermek istiyoruz. Bu değerler yalnız PVGIS'in kendi modellediği
    // açısal yansıma, spektral ve sıcaklık kayıplarını içerir; sistem
    // kayıpları (kablo, inverter, kir…) aşağıda ayrı ayrı uygulanıyor.
    // Kontrol: Σ aylık × 0,86 = core.js EPC_IL_VERIM (81 ilde en fazla %0,4 fark).
    //
    // Biçim: [enlem, boylam, optimum eğim°, optimum azimut°, yıllık düzlem
    //   ışınımı H(i) kWh/m², açısal kayıp %, spektral etki %, sıcaklık kaybı %,
    //   [Oca..Ara kWh/kWp, kayıpsız]]
    const TU_IL = {
        'Adana':[37.1438,35.4984,33,5,2014.3,-2.60,-0.01,-9.74,[105.8,116.2,144.2,152.8,164.3,171.8,180.9,181.6,168,149.6,126.9,108.4]],
        'Adıyaman':[37.7894,38.3141,32,-2,2093.3,-2.52,-0.60,-10.05,[94.3,108.4,147.7,162.6,179.1,185.8,194.5,195.4,184.1,151.2,121.3,100.1]],
        'Afyonkarahisar':[38.6853,30.6427,32,-6,1905.0,-2.72,0.35,-7.45,[72.9,89.6,138.4,158,166.8,176.1,196.6,194.1,172.7,144.8,121.1,90.2]],
        'Aksaray':[38.4326,33.8977,32,-1,2015.8,-2.64,0.24,-7.62,[80.5,102.2,146,164.4,179.2,187.7,203.2,200.7,181.7,154.3,123.4,94]],
        'Amasya':[40.6569,35.7727,26,-13,1598.2,-2.61,0.22,-9.13,[29.4,77.2,118.3,149.9,164,173.9,187,184.2,152.5,109.2,50.5,21.4]],
        'Ankara':[39.716,32.706,32,-4,1896.3,-2.74,0.54,-6.92,[73.9,94.3,139.4,161.2,170.4,177.1,195.9,193.9,175.3,143.7,119.5,81.6]],
        'Antalya':[36.928,30.7277,33,0,2126.6,-2.48,0.17,-9.43,[113.9,121.2,162.7,171.7,178.3,180.7,189,188.3,175.2,155.1,131.1,114.1]],
        'Ardahan':[41.0373,42.7462,31,-7,1549.4,-2.77,0.44,-4.66,[59.2,74.8,104.5,123.6,147.1,164.4,176.9,175.5,156.4,126.9,80.2,53.2]],
        'Artvin':[41.1605,41.8399,22,0,1322.8,-2.63,0.15,-8.90,[25.9,50.9,100,124.8,142.3,154.4,167.4,162.2,123.1,77.7,25.5,21]],
        'Aydın':[37.7406,28.0676,31,-3,2029.0,-2.46,0.40,-9.81,[94.9,106,146.4,164.4,175.4,182.3,198.1,193.9,176.9,150.1,117.2,86.5]],
        'Ağrı':[39.5292,43.3836,29,-11,1557.7,-2.84,0.08,-4.89,[68.2,80.2,110,119.7,149,166,173.7,167.3,157.8,113.7,76.5,58.8]],
        'Balıkesir':[39.5401,28.0229,32,0,1845.0,-2.68,0.60,-8.15,[78.2,85.7,126.7,150.7,167.2,175.9,198,194.7,165.8,133.2,103.4,79.7]],
        'Bartın':[41.4948,32.4354,33,-1,1648.9,-2.70,0.87,-7.29,[64.5,80.2,111.2,141.4,153.3,161.1,179.9,180.9,145.3,113.3,95.6,73.7]],
        'Batman':[37.7874,41.2574,32,21,1942.5,-2.30,-0.51,-10.57,[84.7,101.7,130.3,146.5,171.5,183.1,188,183.9,169.4,131.8,110,87.6]],
        'Bayburt':[40.2023,40.2122,31,-4,1722.2,-2.74,0.13,-5.01,[66,85.7,115.6,137.3,155.2,172.1,190.5,187.6,168.8,136.1,103.9,74.6]],
        'Bilecik':[40.1543,30.148,32,5,1778.1,-2.61,0.60,-8.27,[79,89,123.2,144.9,157,168.1,189.3,186.3,156.6,124.2,101.2,79.2]],
        'Bingöl':[39.0738,40.7296,31,-10,1866.7,-2.61,-0.59,-7.00,[73.7,86.2,114,134.9,165,187.3,198.7,198,180.3,143.8,113.1,85.8]],
        'Bitlis':[38.4951,42.1678,28,-6,1790.5,-2.71,-0.58,-6.82,[56.6,67,101.2,134.2,169.9,192.5,200.8,198.3,181.8,140.2,106.5,64.7]],
        'Bolu':[40.6212,31.646,32,-6,1682.1,-2.83,0.68,-5.12,[70.4,89.7,117.6,141.1,148.2,161.7,191.6,187.2,153.3,125.1,102.3,73.3]],
        'Burdur':[37.5183,30.1691,33,-8,2030.3,-2.65,0.39,-6.74,[107.2,113.6,149.4,164.6,171.4,179.1,194.2,192.1,177.8,155.7,134.1,111]],
        'Bursa':[39.9896,28.8945,32,0,1792.1,-2.71,0.64,-7.78,[76.8,85.2,122.8,146.1,159.5,170.3,195,190.2,158.1,127.2,105.4,81.6]],
        'Denizli':[37.8276,29.239,33,-5,2024.8,-2.56,0.33,-9.63,[101.6,108.4,142.8,159.8,169.3,177.3,190.9,188.2,171.9,148.3,125.3,104.9]],
        'Diyarbakır':[38.0815,40.4298,32,0,2002.2,-2.59,-0.51,-10.56,[83.5,103.4,136.8,149.8,170.5,177.9,186.6,187.2,176.1,147.8,120.6,95.4]],
        'Düzce':[40.8775,31.201,32,0,1610.1,-2.70,0.92,-7.76,[64.9,78.1,108.5,136.3,148.1,159.1,173.3,175.7,143.7,110.1,93.7,66.9]],
        'Edirne':[41.1804,26.6222,33,0,1794.1,-2.74,0.83,-7.39,[81.7,88.6,133.6,157.5,172,170.3,188.8,188.6,156.7,124.7,90.9,76]],
        'Elazığ':[38.5825,39.3962,31,0,1933.0,-2.65,-0.51,-7.91,[74.9,91.2,132.6,149.9,171.3,185.7,197.7,196.5,181.2,147.9,117,78.4]],
        'Erzincan':[39.6073,39.2013,30,1,1741.6,-2.57,0.02,-5.83,[70.4,90,116.5,139.6,158.5,174.9,189.3,187.1,170.2,129,97.9,74.8]],
        'Erzurum':[39.7582,41.4032,29,-10,1623.8,-2.78,-0.40,-5.80,[44,60.7,93,125.3,158.3,178,191.1,184.6,169.4,133.9,94,48.9]],
        'Eskişehir':[39.6821,31.0723,33,-4,1891.1,-2.70,0.49,-7.35,[73,97.5,137.3,158.1,167.1,175,196.8,193.1,172.4,142.6,117.1,83.3]],
        'Gaziantep':[36.9666,37.4074,31,0,2078.4,-2.64,-0.52,-9.17,[96.1,106.6,149.4,162.7,180.4,185.8,193.6,192.7,179.7,151.8,126.5,103.1]],
        'Giresun':[40.6532,38.5172,34,-12,1316.5,-2.81,1.15,-4.37,[70.3,85.7,105.7,120.9,127.2,118.7,117.1,114.7,114.3,98.7,88.2,76.2]],
        'Gümüşhane':[40.2533,39.385,32,-2,1749.5,-2.71,-0.00,-5.57,[70.8,92.8,118.2,139.3,154.2,169.3,189.1,187.4,168.7,132.6,107.6,77.2]],
        'Hakkari':[37.4954,44.1055,30,-18,1818.5,-2.42,-0.50,-5.95,[72.4,82.7,112,134.4,165.2,193.2,200.1,200.8,179.6,135.6,105.8,79]],
        'Hatay':[36.3451,36.0748,30,25,1997.8,-2.32,0.06,-8.98,[79.5,94.8,139.7,162.5,187.1,197.7,203.6,199.2,175.2,138.7,111.2,88]],
        'Isparta':[37.9465,30.9602,32,-8,1977.8,-2.67,0.28,-6.63,[83.9,96.8,141.6,162.6,174.9,184.9,202,196.5,178.3,152.6,128.1,100.2]],
        'Iğdır':[39.8945,43.9427,32,-7,1673.5,-2.64,0.37,-6.71,[77.5,88.9,116.8,127.9,143.3,163.9,174.6,174.1,160.8,126.7,99.8,71.6]],
        'Kahramanmaraş':[37.783,36.8307,31,7,2001.9,-2.51,-0.61,-9.41,[88.2,97.9,134.8,154.7,173.1,186.6,196.8,195.8,178.4,143.5,113.7,93.8]],
        'Karabük':[41.111,32.6194,33,-2,1704.8,-2.77,0.71,-7.59,[73.8,90.4,118.2,140.7,147.4,157.8,183.9,183.3,148.7,119.2,100.1,79.1]],
        'Karaman':[37.1797,33.3384,30,-1,2017.9,-2.64,0.29,-6.82,[81.2,98.2,153.3,166.8,183.6,189,204.3,202.5,183.4,153.8,124.3,95.7]],
        'Kars':[40.4558,42.998,31,-9,1617.1,-2.74,0.15,-5.25,[59.3,80.6,96.9,131.9,148.7,170.2,180.3,179.5,162.1,127.3,100.4,55.2]],
        'Kastamonu':[41.368,33.7619,33,-9,1662.4,-2.69,0.74,-6.75,[66.5,90.8,120.7,143.6,148.8,158.1,179.5,179.6,149,117.9,98.6,66.5]],
        'Kayseri':[38.6582,35.5546,30,-10,1748.8,-2.77,0.14,-5.78,[61.5,81.9,111.4,142.2,156.5,168.4,192.6,193.4,170.3,137.7,112.5,76]],
        'Kilis':[36.7797,37.1417,31,0,2078.8,-2.64,-0.39,-9.21,[96.2,106.5,145.7,160.2,180.7,188.6,196.2,195.5,181,152.2,125.1,102.4]],
        'Kocaeli':[40.8217,29.9507,31,-8,1608.4,-2.61,0.88,-8.32,[64.6,76.3,111.6,140.3,154.5,164.5,178.7,172.6,138.6,102.8,82.1,62.2]],
        'Konya':[38.0212,32.5225,32,-5,2017.5,-2.65,0.26,-7.17,[91.5,110.5,154.6,165.3,170.8,178.4,199.9,198.9,178.4,153.7,127.5,98.3]],
        'Kütahya':[39.2523,29.4938,32,-9,1815.8,-2.80,0.50,-6.64,[76.6,91.6,132,150.3,158.4,169.2,193.8,188.7,163,134.7,113.3,84.3]],
        'Kırklareli':[41.7078,27.6051,33,-1,1737.1,-2.84,0.91,-5.81,[78.8,85.5,125.8,152.2,170.4,172.2,192.3,194.1,154.3,120.3,88.5,69.8]],
        'Kırıkkale':[39.886,33.8279,32,-1,1876.5,-2.74,0.46,-7.59,[72.8,94.2,137.3,155.6,163.5,175.1,194.7,193.6,170.2,142.2,114.8,80.3]],
        'Kırşehir':[39.3303,34.1266,32,-3,1892.7,-2.76,0.40,-6.68,[74.3,91.7,136.2,156.2,166.2,177.1,196.8,196.7,174.6,145,119.5,90]],
        'Malatya':[38.482,38.1035,32,-3,1998.0,-2.58,-0.67,-8.90,[86.1,103.7,141.5,155.5,169.4,179.6,193.7,193.5,180.2,148,121.6,88.8]],
        'Manisa':[38.8574,28.0566,34,-4,2022.5,-2.63,0.51,-8.61,[104.7,105.5,142,160.4,173.1,177.8,197.9,194.6,174.9,149.6,123.1,105.1]],
        'Mardin':[37.3611,40.8959,32,0,2053.4,-2.61,-0.48,-9.63,[93.6,106.6,142.4,155.6,177.8,184.2,190.7,191.6,181.9,149.8,122.4,102]],
        'Mersin':[36.8328,33.9686,32,-8,2041.2,-2.76,0.13,-6.70,[94.5,108.3,156.8,165.2,171,181.8,197.7,194.2,177.3,158.3,136.5,112.5]],
        'Muğla':[37.1642,28.2624,32,-5,2054.5,-2.63,0.49,-9.32,[102.3,104.5,148,166.6,176.5,181.3,194.7,192.1,176,152.6,124.2,104.3]],
        'Muş':[38.9741,41.959,30,-6,1789.3,-2.69,-0.58,-7.07,[56.6,83.3,99.7,137.3,165.2,184,191.3,191.1,177.3,144.6,111.2,66.9]],
        'Nevşehir':[38.7235,34.7194,32,-3,1941.8,-2.69,0.32,-7.30,[82.4,96.6,139.3,156.7,165.5,178.8,196.8,197.2,177.8,149.1,122.4,94.8]],
        'Niğde':[38.0665,34.7051,32,-6,2007.5,-2.63,0.17,-6.21,[88.4,106.8,146.5,162.3,173.7,183.4,200,200.3,183.3,158.2,131.2,102.5]],
        'Ordu':[40.8293,37.4083,32,4,1383.6,-2.80,0.99,-7.06,[64,73.8,102.1,125.3,134.5,135.2,132.2,127.8,120.1,96.4,82.7,68.3]],
        'Osmaniye':[37.2518,36.2994,33,7,1965.8,-2.58,-0.12,-9.69,[101.4,111.7,135.1,148,166.1,168.8,174.3,177.8,169,146.2,123.8,105.1]],
        'Rize':[40.957,40.8844,34,-6,1206.6,-2.76,1.43,-5.09,[67.7,83.2,99.1,111.3,115.1,104.1,96.4,98.8,105.8,95.7,83.4,69]],
        'Sakarya':[40.7732,30.4816,33,3,1632.6,-2.73,0.85,-8.61,[68.7,79.3,110.1,133.4,145.7,159.8,175.7,174.2,141.4,109.5,93.4,72.5]],
        'Samsun':[41.2304,35.9683,33,-3,1583.1,-2.83,0.90,-6.56,[70.4,81.5,112.2,138.5,147.6,156.1,164.5,163.3,134.8,107,96.5,77.8]],
        'Siirt':[37.8647,42.051,31,-2,1966.9,-2.57,-0.55,-9.34,[90.3,100.2,128.1,145.1,169,181,187.7,189.1,177.3,144.4,120.2,95.3]],
        'Sinop':[41.6476,34.956,31,4,1668.2,-2.80,0.78,-6.72,[62.3,87.4,121.1,147.5,156.5,165,186,182.4,147.1,113,92,64.1]],
        'Sivas':[39.4192,37.1012,29,14,1758.7,-2.54,-0.31,-5.72,[54,73.8,120.2,150.8,161.6,180.4,200.9,200.9,169,132.5,102.2,64.7]],
        'Tekirdağ':[41.0731,27.4102,33,2,1751.9,-2.83,0.85,-6.99,[76.8,84.3,129.3,157.8,170,171.2,188.3,186.5,149.6,119.2,89.7,74.1]],
        'Tokat':[40.3892,36.6315,32,1,1740.5,-2.68,0.61,-6.70,[69.5,90.4,119.3,146.3,156.8,169.9,178,182.7,164.7,129.5,105.8,77.2]],
        'Trabzon':[40.8526,39.7849,30,0,1130.0,-2.84,1.49,-7.18,[56.2,73.2,90.2,110.2,117.6,104.3,97,89.9,90.6,80,72.2,53]],
        'Tunceli':[39.2198,39.414,30,5,1812.2,-2.65,-0.78,-7.73,[58.4,79.7,116.4,133.5,156,183.9,197.2,192.3,175.4,136.7,110.9,74.9]],
        'Uşak':[38.5769,29.373,34,-6,2047.0,-2.61,0.35,-8.18,[102.2,112.7,147.4,163.5,171.7,176.2,195.6,193.1,175.9,155.1,133,110.7]],
        'Van':[38.325,43.659,30,-11,1802.9,-2.74,-0.29,-5.49,[81.7,87.1,116.1,145.7,169.2,178.9,184.3,185,177.9,142.3,106.2,78]],
        'Yalova':[40.5795,29.1687,30,12,1700.6,-2.70,0.67,-7.64,[61.4,74.2,116.5,147.9,165.5,177.6,196.9,189.6,149.7,110,86.1,63]],
        'Yozgat':[39.7152,35.171,32,-1,1879.8,-2.71,0.28,-6.53,[68.6,92.7,133.9,157.8,168.4,178.1,194.6,198.1,175.7,144.6,117.2,84.4]],
        'Zonguldak':[41.2503,31.839,32,-5,1592.2,-2.81,0.88,-7.48,[58.6,75.9,106.6,139.1,150.1,156.8,173.2,173.8,139.9,110,92.5,68]],
        'Çanakkale':[40.055,26.9278,31,8,1769.0,-2.76,0.76,-7.36,[74,80.4,128.2,155,169,175,197.8,193.7,155.5,115,87.7,74.2]],
        'Çankırı':[40.6668,33.4526,33,-6,1802.8,-2.79,0.53,-6.94,[66,94.7,134,153,158.7,167.7,188.6,186.2,164.1,135.8,113.9,76.9]],
        'Çorum':[40.5698,34.7269,32,-1,1768.2,-2.81,0.43,-7.27,[64.6,88.8,127.1,150.4,157.1,168.6,186.3,185.1,161.6,130.2,106.5,74.3]],
        'İstanbul':[41.0707,29.0509,32,9,1719.2,-2.77,0.73,-6.46,[71.1,81.5,124.2,155.1,171.2,177.6,192.7,185.6,149.1,112.2,86.4,68.4]],
        'İzmir':[38.2317,27.03,33,0,2063.8,-2.67,0.55,-8.17,[106.3,107.7,147.2,168.2,181,184,201.3,199,178.1,153.5,123.6,104.8]],
        'Şanlıurfa':[37.2595,39.0408,32,0,2108.4,-2.58,-0.59,-10.08,[103.7,111.8,148.4,160.7,176.9,184.5,190.7,191.8,181.5,152.5,126.7,106.8]],
        'Şırnak':[37.4553,42.5212,29,-5,1909.3,-2.51,-0.74,-9.11,[78.1,89.3,120.5,142,170.1,183.6,191.6,194,178.9,137.4,109.2,84.3]]
    };

    // --- VERİ: ÇATI YÖNÜ VE EĞİMİ DÜZELTMESİ -----------------------------------
    // Aynı kaynaktan (PVGIS, loss=0) eğim × azimut ızgarası: her ay için
    // "bu yön/eğim ÷ optimum" oranı. Antalya (36,9°K), Ankara (39,7°K) ve
    // Samsun (41,2°K) için ayrı çekildi; yaygın çatı yönlerinde üçü arasındaki
    // fark %1-3 (en çok doğu/batıda), bu yüzden üçünün ORTALAMASI kullanılıyor.
    // Anahtar: 'eğim,azimut' — azimut 0 = güney, −90 = doğu, +90 = batı.
    // Aylık tutulması önemli: yatay panel yazın optimumu GEÇİYOR (1,08),
    // kışın %40 geride kalıyor; yıllık tek katsayı bu mevsim kaymasını silerdi.
    const TU_YON_F = {
        '0,0':[0.633,0.725,0.830,0.940,1.032,1.081,1.061,0.970,0.853,0.736,0.606,0.575],
        '10,0':[0.772,0.834,0.906,0.982,1.046,1.080,1.067,1.004,0.923,0.842,0.754,0.733],
        '10,45':[0.731,0.800,0.881,0.966,1.037,1.073,1.062,0.994,0.898,0.807,0.709,0.686],
        '10,-45':[0.730,0.801,0.883,0.968,1.040,1.081,1.061,0.990,0.902,0.811,0.711,0.685],
        '10,90':[0.630,0.719,0.821,0.929,1.018,1.062,1.048,0.963,0.841,0.725,0.603,0.572],
        '10,-90':[0.630,0.720,0.825,0.932,1.023,1.074,1.047,0.956,0.848,0.733,0.604,0.572],
        '10,135':[0.526,0.633,0.759,0.892,1.001,1.055,1.035,0.929,0.783,0.642,0.490,0.455],
        '10,-135':[0.526,0.634,0.761,0.893,1.004,1.064,1.034,0.924,0.788,0.647,0.490,0.455],
        '10,180':[0.478,0.594,0.733,0.877,0.996,1.058,1.030,0.913,0.760,0.607,0.438,0.402],
        '20,0':[0.888,0.921,0.961,1.003,1.039,1.058,1.051,1.017,0.971,0.926,0.879,0.867],
        '20,45':[0.808,0.857,0.913,0.975,1.024,1.046,1.044,0.999,0.924,0.858,0.792,0.777],
        '20,-45':[0.806,0.858,0.918,0.979,1.030,1.063,1.044,0.991,0.933,0.867,0.795,0.775],
        '20,90':[0.625,0.706,0.802,0.904,0.987,1.024,1.017,0.938,0.819,0.709,0.596,0.569],
        '20,-90':[0.624,0.711,0.808,0.911,0.998,1.048,1.017,0.930,0.831,0.722,0.600,0.568],
        '20,135':[0.432,0.540,0.677,0.824,0.947,1.004,0.984,0.866,0.698,0.544,0.383,0.356],
        '20,-135':[0.432,0.544,0.682,0.829,0.954,1.022,0.983,0.857,0.709,0.555,0.386,0.355],
        '20,180':[0.335,0.451,0.615,0.792,0.938,1.011,0.976,0.833,0.645,0.459,0.273,0.257],
        '30,0':[0.979,0.986,0.995,1.004,1.011,1.015,1.014,1.007,0.997,0.987,0.977,0.974],
        '30,45':[0.865,0.892,0.927,0.965,0.993,1.004,1.009,0.985,0.932,0.890,0.854,0.845],
        '30,-45':[0.862,0.896,0.932,0.972,1.007,1.032,1.015,0.977,0.944,0.903,0.858,0.843],
        '30,90':[0.616,0.686,0.776,0.870,0.945,0.975,0.974,0.905,0.787,0.688,0.585,0.561],
        '30,-90':[0.613,0.695,0.785,0.881,0.961,1.011,0.978,0.894,0.808,0.706,0.591,0.559],
        '30,135':[0.362,0.460,0.594,0.745,0.874,0.930,0.911,0.787,0.610,0.457,0.305,0.287],
        '30,-135':[0.362,0.466,0.601,0.753,0.885,0.958,0.912,0.776,0.626,0.470,0.307,0.289],
        '30,180':[0.283,0.325,0.481,0.686,0.857,0.940,0.898,0.729,0.509,0.310,0.186,0.235],
        '40,0':[1.045,1.027,1.006,0.982,0.963,0.951,0.955,0.975,0.999,1.024,1.048,1.054],
        '40,45':[0.900,0.908,0.921,0.940,0.949,0.948,0.961,0.955,0.922,0.903,0.892,0.891],
        '40,-45':[0.896,0.913,0.929,0.948,0.965,0.980,0.966,0.945,0.939,0.918,0.897,0.888],
        '40,90':[0.596,0.661,0.741,0.829,0.893,0.916,0.922,0.864,0.751,0.657,0.571,0.546],
        '40,-90':[0.594,0.670,0.754,0.840,0.913,0.962,0.929,0.849,0.777,0.681,0.577,0.545],
        '40,135':[0.313,0.397,0.519,0.663,0.788,0.839,0.822,0.701,0.528,0.387,0.253,0.247],
        '40,-135':[0.314,0.401,0.526,0.672,0.804,0.877,0.827,0.690,0.546,0.399,0.255,0.246],
        '40,180':[0.267,0.280,0.346,0.559,0.753,0.843,0.794,0.601,0.359,0.222,0.182,0.217],
        '50,0':[1.084,1.044,0.994,0.940,0.893,0.865,0.875,0.920,0.979,1.036,1.092,1.107],
        '50,45':[0.913,0.904,0.897,0.895,0.887,0.875,0.894,0.906,0.891,0.893,0.907,0.913],
        '50,-45':[0.909,0.911,0.908,0.907,0.907,0.915,0.904,0.898,0.912,0.912,0.913,0.910],
        '50,90':[0.570,0.626,0.698,0.777,0.831,0.849,0.859,0.812,0.709,0.624,0.545,0.524],
        '50,-90':[0.567,0.637,0.712,0.789,0.855,0.903,0.870,0.796,0.735,0.648,0.553,0.522],
        '50,135':[0.275,0.345,0.452,0.585,0.699,0.743,0.730,0.617,0.457,0.332,0.216,0.216],
        '50,-135':[0.274,0.347,0.457,0.592,0.717,0.786,0.736,0.605,0.472,0.341,0.218,0.215],
        '50,180':[0.240,0.256,0.267,0.418,0.625,0.719,0.663,0.452,0.233,0.204,0.164,0.195],
        '90,0':[0.976,0.867,0.719,0.554,0.423,0.347,0.366,0.482,0.657,0.834,0.991,1.034],
        '90,45':[0.753,0.690,0.625,0.564,0.505,0.468,0.495,0.553,0.600,0.666,0.749,0.779],
        '90,-45':[0.745,0.700,0.638,0.579,0.524,0.502,0.503,0.548,0.626,0.689,0.759,0.774],
        '90,90':[0.385,0.410,0.451,0.491,0.510,0.513,0.533,0.518,0.455,0.407,0.373,0.358],
        '90,-90':[0.375,0.417,0.455,0.495,0.525,0.553,0.532,0.495,0.476,0.428,0.382,0.353],
        '90,135':[0.140,0.175,0.230,0.304,0.369,0.388,0.387,0.322,0.231,0.166,0.106,0.109],
        '90,-135':[0.136,0.174,0.228,0.301,0.370,0.411,0.380,0.303,0.234,0.165,0.108,0.108],
        '90,180':[0.125,0.136,0.142,0.157,0.197,0.213,0.188,0.133,0.109,0.108,0.085,0.101]
    };

    // --- SABİTLER ---------------------------------------------------------------
    const AY_GUN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
                   'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    // Her ayın "ortalama günü" (Klein, 1977): o ayın ortalama güneş
    // geometrisini en iyi temsil eden gün numarası.
    const TEMSIL_GUN = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
    const EGIMLER = [0, 10, 20, 30, 40, 50, 90];
    const AZIMUTLAR = [-135, -90, -45, 0, 45, 90, 135, 180];

    // SİSTEM KAYIPLARI (PVGIS'in modellemediği kalemler). Toplamı %13,2 —
    // PVGIS'in tek kalem %14 varsayılanına yakın; böylece "gölgelenme yok"
    // seçildiğinde sonuç sitenin diğer araçlarıyla örtüşüyor. Kullanıcı
    // "Gelişmiş ayarlar"dan her birini değiştirebilir.
    const SISTEM_KAYIP = [
        { k: 'kir',     ad: 'Kirlenme (toz, polen, kuş)',            yuzde: 3 },
        { k: 'uyum',    ad: 'Modül uyumsuzluğu ve güç toleransı',    yuzde: 2 },
        { k: 'dc',      ad: 'DC kablo kaybı',                         yuzde: 2 },
        { k: 'inv',     ad: 'İnverter dönüşüm kaybı',                 yuzde: 3 },
        { k: 'ac',      ad: 'AC kablo ve bağlantı kaybı',             yuzde: 1 },
        { k: 'durus',   ad: 'Duruş (bakım, arıza, şebeke kesintisi)', yuzde: 1 },
        { k: 'lid',     ad: 'İlk yıl ışık kaynaklı bozulma (LID)',    yuzde: 2 }
    ];
    const GOLGE = { yok: 0, az: 3, orta: 7, fazla: 12 };

    // İhtiyaç fazlası (şebekeye verilen ve ay içinde mahsuplaşmayan) enerji,
    // abone grubunun AKTİF ENERJİ BEDELİ üzerinden alınıyor (vergisiz). Oran,
    // EPDK 4 Nisan 2026 tablosundaki enerji bedeli ÷ vergili toplam tarife
    // (bkz. tarife-epdk.sql). Mutlak TL yerine ORAN tutuluyor: yönetici
    // tarifeyi güncellediğinde satış bedeli de onunla birlikte ölçeklenir.
    const ENERJI_ORANI = {
        tariffMeskenDusuk:    0.494065 / 3.54,   // düşük kademede enerji bedeli çok düşük
        tariffMesken:         1.895808 / 5.32,
        tariffTicarethane:    2.873087 / 6.63,
        tariffTicarethaneUst: 3.454688 / 7.37,
        tariffSanayi:         2.985253 / 5.85,
        tariffTarimsal:       2.333838 / 5.30
    };
    const TARIFE_AD = {
        tariffMeskenDusuk: 'Mesken (günde 8 kWh ve altı)', tariffMesken: 'Mesken (günde 8 kWh üstü)',
        tariffTicarethane: 'Ticarethane (günde 30 kWh ve altı)', tariffTicarethaneUst: 'Ticarethane (günde 30 kWh üstü)',
        tariffSanayi: 'Sanayi', tariffTarimsal: 'Tarımsal sulama'
    };

    // Piyasadaki yaygın inverter AC güçleri (kW)
    const STD_INVERTER = [1, 1.5, 2, 2.5, 3, 3.6, 4, 4.6, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 36, 40, 50, 60, 80, 100];
    const DC_AC = 1.15;            // fatura analiziyle aynı oran
    const MOTOR_KALKIS = 2;        // motorlu yük kalkışta ~3× çeker → çalışma gücüne ek 2×
    const BATARYA_GIDIS_DONUS = 0.92;   // LFP + ek dönüşüm, gidiş-dönüş verimi
    const EV_KWH_KM = 0.18;        // elektrikli araç, şarj kaybı dahil
    const MIN_DONGU = 100;         // öz tüketim bataryasında eklenen modülün yıllık asgari tam döngüsü

    // Tüketim zaman pencereleri (yerel saat). Gece 23→06 geceyarısını aşıyor.
    const PENCERE = { gunboyu: [0, 24], sabah: [6, 9], gunduz: [9, 17], aksam: [17, 23], gece: [23, 30] };
    const PENCERE_AD = { gunboyu: 'Gün boyu', sabah: 'Sabah 06–09', gunduz: 'Gündüz 09–17', aksam: 'Akşam 17–23', gece: 'Gece 23–06' };

    // Yaşam düzenine göre TİPİK profil: tabanYük (buzdolabı, modem, bekleme)
    // 24 saate eşit yayılır; kalanı pencerelere paylaştırılır. Varsayımdır —
    // gerçek dağılım için "Cihaz cihaz" sekmesi kullanılır.
    const YASAM = {
        calisan: { ad: 'Gündüz evde kimse yok', taban: 0.30, pay: { sabah: 0.15, gunduz: 0.08, aksam: 0.67, gece: 0.10 } },
        evde:    { ad: 'Gündüz evde biri var',  taban: 0.30, pay: { sabah: 0.12, gunduz: 0.33, aksam: 0.47, gece: 0.08 } },
        evofis:  { ad: 'Evden çalışıyorum',     taban: 0.28, pay: { sabah: 0.10, gunduz: 0.45, aksam: 0.38, gece: 0.07 } },
        isyeri:  { ad: 'İş yeri (gündüz açık)', taban: 0.15, pay: { sabah: 0.10, gunduz: 0.80, aksam: 0.10, gece: 0 } }
    };
    // Yalnız aylık ORTALAMA girilmişse yıl içi dağılım (m: 0 = Ocak).
    const MEVSIM_DESEN = {
        dengeli: (m) => 1 + 0.06 * Math.cos(2 * Math.PI * m / 12),   // kışın biraz fazla aydınlatma
        yaz:     (m) => 1 - 0.25 * Math.cos(2 * Math.PI * m / 12),   // klima: Temmuz +%25
        kis:     (m) => 1 + 0.35 * Math.cos(2 * Math.PI * m / 12)    // elektrikle ısınma: Ocak +%35
    };
    // Cihaz mevsimi → aylık kullanım katsayısı
    const MEVSIM_AY = {
        tum: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        yaz: [0, 0, 0, 0, 0.3, 1, 1, 1, 0.6, 0, 0, 0],
        kis: [1, 1, 0.7, 0.3, 0, 0, 0, 0, 0, 0.3, 0.7, 1]
    };

    // --- AYAR OKUYUCU -----------------------------------------------------------
    function A() {
        const s = (typeof window !== 'undefined' && window.EPC_SETTINGS) || {};
        const n = (v, d) => (Number(v) > 0 ? Number(v) : d);
        return {
            panelKwp:   n(s.kwpPerPanel, 0.55),
            m2PerKwp:   n(s.roofM2PerKwp, 5.5),
            dod:        n(s.batteryDod, 0.9),
            invVerim:   n(s.inverterEff, 0.95),
            modulKwh:   n(s.batteryModule, 5),
            surge:      n(s.inverterSurge, 1.3),
            batUsdKwh:  n(s.batteryUsdPerKwh, 300)
        };
    }
    const tarife = (k) => (typeof window !== 'undefined' && window.epcTarife) ? window.epcTarife(k) : 5.32;
    const tlPerKwp = () => (typeof window !== 'undefined' && window.epcTlPerKwp) ? window.epcTlPerKwp() : 48430;
    const kur = () => (typeof window !== 'undefined' && window.epcKur) ? window.epcKur() : 48.43;

    // --- YÖN/EĞİM KATSAYISI (12 ay) ----------------------------------------------
    function _ızgara(e, a) { return TU_YON_F[e === 0 ? '0,0' : e + ',' + a]; }
    function yonKatsayi(egim, az) {
        const e = Math.max(0, Math.min(90, Number(egim) || 0));
        let a = Number(az) || 0;
        while (a > 180) a -= 360;
        while (a <= -180) a += 360;
        // Eğim kovası
        let i = 0;
        while (i < EGIMLER.length - 2 && e > EGIMLER[i + 1]) i++;
        const e0 = EGIMLER[i], e1 = EGIMLER[i + 1], te = (e - e0) / (e1 - e0);
        // Azimut kovası (dairesel: 180 ile −135 arası −180 üzerinden)
        let a0, a1, ta;
        if (a < -135) { a0 = 180; a1 = -135; ta = (a + 180) / 45; }
        else {
            let j = 0;
            while (j < AZIMUTLAR.length - 2 && a > AZIMUTLAR[j + 1]) j++;
            a0 = AZIMUTLAR[j]; a1 = AZIMUTLAR[j + 1]; ta = (a - a0) / (a1 - a0);
        }
        const out = [];
        for (let m = 0; m < 12; m++) {
            const v00 = _ızgara(e0, a0)[m], v01 = _ızgara(e0, a1)[m];
            const v10 = _ızgara(e1, a0)[m], v11 = _ızgara(e1, a1)[m];
            const alt = v00 + (v01 - v00) * ta, ust = v10 + (v11 - v10) * ta;
            out.push(alt + (ust - alt) * te);
        }
        return out;
    }

    // --- SAATLİK GÜNEŞ PROFİLİ ---------------------------------------------------
    // Her ayın temsili gününde, panel düzlemine düşen açık-gökyüzü ışınımının
    // saatlere dağılımı (toplamı 1). Yalnız ŞEKİL için kullanılıyor; günlük
    // ENERJİ PVGIS'ten geliyor. Bulutlu günler profili yassılttığı için
    // %35 dağınık (difüz) pay ekleniyor.
    //
    // ⚠️ SAAT DİLİMİ: Türkiye yıl boyu UTC+3 (standart boylam 45°D). İstanbul'da
    // güneş öğlesi 13:00 civarı, Van'da 12:00 civarı. Bu kayma tüketimle
    // çakışmayı (öz tüketimi) doğrudan etkiliyor, o yüzden hesaba katılıyor.
    let _sekilOnbellek = {}, _sekilSayisi = 0;
    function gunesSekli(lat, lon, egim, az) {
        const anahtar = [lat, lon, egim, az].join('|');
        if (_sekilOnbellek[anahtar]) return _sekilOnbellek[anahtar];
        // Pusula sürüklenirken her açı ayrı anahtar üretiyor; sınırsız büyümesin.
        if (++_sekilSayisi > 300) { _sekilOnbellek = {}; _sekilSayisi = 1; }
        const R = Math.PI / 180, phi = lat * R, beta = egim * R, gam = az * R;
        const sonuc = [];
        for (let m = 0; m < 12; m++) {
            const n = TEMSIL_GUN[m];
            const dek = 23.45 * R * Math.sin(2 * Math.PI * (284 + n) / 365);
            const B = 2 * Math.PI * (n - 81) / 364;
            const zamanDenk = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // dk
            const w = new Array(24).fill(0);
            let top = 0;
            for (let h = 0; h < 24; h++) {
                let t = 0;
                for (let k = 0; k < 6; k++) {
                    const yerel = h + (k + 0.5) / 6;
                    const gunesSaati = yerel + (4 * (lon - 45) + zamanDenk) / 60;
                    const om = 15 * (gunesSaati - 12) * R;
                    const sinAlt = Math.sin(phi) * Math.sin(dek) + Math.cos(phi) * Math.cos(dek) * Math.cos(om);
                    if (sinAlt <= 0.01) continue;
                    const alt = Math.asin(sinAlt);
                    const cosAz = (sinAlt * Math.sin(phi) - Math.sin(dek)) / (Math.cos(alt) * Math.cos(phi));
                    let gs = Math.acos(Math.max(-1, Math.min(1, cosAz)));
                    if (om < 0) gs = -gs;
                    const zen = Math.PI / 2 - alt;
                    const cosTeta = Math.cos(zen) * Math.cos(beta) + Math.sin(zen) * Math.sin(beta) * Math.cos(gs - gam);
                    const hk = 1 / (sinAlt + 0.50572 * Math.pow(alt / R + 6.07995, -1.6364));   // hava kütlesi
                    const dni = 1361 * Math.pow(0.7, Math.pow(hk, 0.678));
                    t += 0.65 * dni * Math.max(0, cosTeta) + 0.35 * dni * sinAlt * (1 + Math.cos(beta)) / 2;
                }
                w[h] = t; top += t;
            }
            sonuc.push(w.map(v => (top > 0 ? v / top : 0)));
        }
        _sekilOnbellek[anahtar] = sonuc;
        return sonuc;
    }

    // --- ÜRETİM (1 kWp için) ----------------------------------------------------
    // o: { il, egim, az | yuzeyler:[{az,pay}], golge: yüzde, kayiplar: {k: yüzde},
    //      lat, lon (isteğe bağlı: GPS'ten — yalnız saatlik şekil için) }
    function uretim(o) {
        const d = TU_IL[o.il];
        if (!d) return null;
        const [lat, lon, optEgim, optAz, , lAoi, lSpec, lTg, emOpt] = d;
        const egim = o.egim === 'opt' ? optEgim : Number(o.egim) || 0;
        const yuzeyler = o.yuzeyler || [{ az: o.az === 'opt' ? optAz : (Number(o.az) || 0), pay: 1 }];

        // Yönetici bir il için yerinde ölçüm / PVsyst değeri girdiyse (core.js
        // epcIlVerim ile aynı anahtar) aylık değerler o yıllık değere ölçekleniyor.
        // Ayar, optimum yönlü ve %14 kayıplı sistemin değeri olarak giriliyor.
        let olcek = 1, kaynak = 'pvgis';
        const S = (typeof window !== 'undefined' && window.EPC_SETTINGS) || {};
        const anahtar = (typeof window !== 'undefined' && window.epcIlAnahtar) ? window.epcIlAnahtar(o.il) : '';
        const ayar = Number(S['solarYield_' + anahtar]);
        if (ayar > 0) {
            const tabloY = emOpt.reduce((a, b) => a + b, 0) * 0.86;
            olcek = ayar / tabloY; kaynak = 'ayar';
        }

        // Yön/eğim düzeltmesi (birden çok yüzey: doğu-batı gibi, paylarıyla)
        const F = new Array(12).fill(0);
        const sekil = Array.from({ length: 12 }, () => new Array(24).fill(0));
        const sLat = Number(o.lat) || lat, sLon = Number(o.lon) || lon;
        // "Optimum" seçildiyse katsayı tanım gereği 1: ızgaradan aradeğerlemek
        // %0,5 civarı sapma getiriyordu (ızgara 10°/45° aralıklı).
        const tamOptimum = o.egim === 'opt' && o.az === 'opt' && !o.yuzeyler;
        yuzeyler.forEach(y => {
            const f = tamOptimum ? new Array(12).fill(1) : yonKatsayi(egim, y.az);
            const sk = gunesSekli(sLat, sLon, egim, y.az);
            for (let m = 0; m < 12; m++) {
                F[m] += f[m] * y.pay;
                for (let h = 0; h < 24; h++) sekil[m][h] += sk[m][h] * y.pay * f[m];
            }
        });
        // Yüzeyler farklı enerji ürettiğinde şekil enerji ağırlıklı → yeniden normalle
        sekil.forEach(w => { const t = w.reduce((a, b) => a + b, 0); for (let h = 0; h < 24; h++) w[h] = t > 0 ? w[h] / t : 0; });

        const dcAylik = emOpt.map((v, m) => v * olcek * F[m]);        // PVGIS kayıpları dahil, sistem kayıpları hariç
        const dcYillik = dcAylik.reduce((a, b) => a + b, 0);

        // Kayıp şelalesi — yüzdeler sırayla, her biri bir öncekinden kalan
        // enerjiye uygulanıyor (çarpımsal; toplanırsa kayıp abartılır).
        const pvgisCarpan = (1 + lAoi / 100) * (1 + lSpec / 100) * (1 + lTg / 100);
        const referans = dcYillik / pvgisCarpan;   // kWh/kWp = panel düzlemine gelen kWh/m² (STC)
        const kalemler = [
            { k: 'aoi',   ad: 'Açısal yansıma (camdan geri yansıyan ışık)', yuzde: lAoi,  kaynak: 'PVGIS' },
            { k: 'spec',  ad: 'Spektral etki (ışığın renk dağılımı)',        yuzde: lSpec, kaynak: 'PVGIS' },
            { k: 'tg',    ad: 'Sıcaklık ve düşük ışınım kaybı',              yuzde: lTg,   kaynak: 'PVGIS · ' + o.il }
        ];
        const golge = Number(o.golge) || 0;
        if (golge > 0) kalemler.push({ k: 'golge', ad: 'Gölgelenme', yuzde: -golge, kaynak: 'sizin seçiminiz' });
        const ozel = o.kayiplar || {};
        SISTEM_KAYIP.forEach(s => {
            const y = ozel[s.k] != null && isFinite(Number(ozel[s.k])) ? Number(ozel[s.k]) : s.yuzde;
            if (y !== 0) kalemler.push({ k: s.k, ad: s.ad, yuzde: -Math.abs(y), kaynak: ozel[s.k] != null ? 'sizin ayarınız' : 'varsayım' });
        });
        let v = referans;
        const adimlar = kalemler.map(kl => {
            const fark = v * kl.yuzde / 100;
            v += fark;
            return Object.assign({}, kl, { fark, sonra: v });
        });
        const netYillik = v;
        const sistemCarpan = netYillik / dcYillik;   // gölge + sistem kayıpları
        const aylik = dcAylik.map(x => x * sistemCarpan);

        return {
            il: o.il, lat, lon, optEgim, optAz, egim, yuzeyler, kaynak, olcek,
            F, aylik, yillik: netYillik, dcYillik, referans, adimlar, sekil,
            pr: netYillik / referans,
            optOran: dcYillik / (emOpt.reduce((a, b) => a + b, 0) * olcek)
        };
    }

    // --- TÜKETİM -----------------------------------------------------------------
    function _pencereDagit(w, pencere, enerji) {
        const [b, s] = PENCERE[pencere] || PENCERE.gunboyu;
        const uz = s - b;
        for (let h = b; h < s; h++) w[h % 24] += enerji / uz;
    }
    function yasamProfili(yasamK) {
        const y = YASAM[yasamK] || YASAM.calisan;
        const w = new Array(24).fill(y.taban / 24);
        Object.keys(y.pay).forEach(p => { if (y.pay[p] > 0) _pencereDagit(w, p, y.pay[p] * (1 - y.taban)); });
        // Pencere sınırlarındaki basamakları yumuşat (¼-½-¼, gece yarısından
        // sarmalı). Toplam enerji değişmez; akşam yükü 17:00'de birden değil
        // 16-18 arasında artar — gerçek ev yüküne daha yakın.
        return w.map((v, h) => 0.25 * w[(h + 23) % 24] + 0.5 * v + 0.25 * w[(h + 1) % 24]);
    }
    const _norm = (w) => { const t = w.reduce((a, b) => a + b, 0); return w.map(v => (t > 0 ? v / t : 1 / 24)); };

    // Cihaz satırı: { ad, adet, w, saat, zaman, mevsim }
    function cihazGunluk(c, m) {
        const kwh = (Number(c.adet) || 0) * (Number(c.w) || 0) * (Number(c.saat) || 0) / 1000;
        return kwh * ((MEVSIM_AY[c.mevsim] || MEVSIM_AY.tum)[m]);
    }
    function cihazYillik(c) { let t = 0; for (let m = 0; m < 12; m++) t += cihazGunluk(c, m) * AY_GUN[m]; return t; }

    // o: { mod: 'fatura'|'cihaz', aylikOrt, aylar[12]|null, desen, yasam,
    //      cihazlar[], faturaEsas, evKm, evZaman }
    function tuketim(o) {
        const aylarGecerli = Array.isArray(o.aylar) && o.aylar.filter(v => Number(v) > 0).length === 12;
        const faturaYillik = aylarGecerli ? o.aylar.reduce((a, b) => a + Number(b), 0)
                           : (Number(o.aylikOrt) > 0 ? Number(o.aylikOrt) * 12 : 0);
        let aylik = new Array(12).fill(0), profil = [], kaynak;

        if (o.mod === 'cihaz') {
            const liste = (o.cihazlar || []).filter(c => Number(c.adet) > 0 && Number(c.w) > 0 && Number(c.saat) > 0);
            for (let m = 0; m < 12; m++) {
                const w = new Array(24).fill(0);
                let gun = 0;
                liste.forEach(c => { const e = cihazGunluk(c, m); if (e > 0) { _pencereDagit(w, c.zaman, e); gun += e; } });
                aylik[m] = gun * AY_GUN[m];
                profil.push(_norm(w));
            }
            kaynak = 'cihaz';
            const cihazY = aylik.reduce((a, b) => a + b, 0);
            if (o.faturaEsas && faturaYillik > 0 && cihazY > 0) {
                // Netleştirme: toplam faturadan, saatlik dağılım cihaz listesinden.
                // 12 ay girildiyse aylık şekil de faturadan; yoksa cihaz listesinin
                // mevsim şekli faturanın yıllık toplamına ölçeklenir.
                if (aylarGecerli) aylik = o.aylar.map(Number);
                else aylik = aylik.map(v => v * faturaYillik / cihazY);
                kaynak = 'cihaz+fatura';
            }
        } else {
            if (aylarGecerli) aylik = o.aylar.map(Number);
            else if (faturaYillik > 0) {
                const f = MEVSIM_DESEN[o.desen] || MEVSIM_DESEN.dengeli;
                const agirlik = AY_GUN.map((g, m) => g * f(m));
                const t = agirlik.reduce((a, b) => a + b, 0);
                aylik = agirlik.map(a => faturaYillik * a / t);
            }
            const p = _norm(yasamProfili(o.yasam));
            profil = Array.from({ length: 12 }, () => p.slice());
            kaynak = 'fatura';
        }

        // Elektrikli araç: ek tüketim, seçilen şarj penceresinde
        const evKm = Number(o.evKm) || 0;
        let evYillik = 0;
        if (evKm > 0) {
            evYillik = evKm * EV_KWH_KM;
            for (let m = 0; m < 12; m++) {
                const evAy = evYillik * AY_GUN[m] / 365;
                const evGun = evAy / AY_GUN[m];
                const gunMevcut = aylik[m] / AY_GUN[m];
                const w = profil[m].map(x => x * gunMevcut);
                _pencereDagit(w, o.evZaman || 'gece', evGun);
                profil[m] = _norm(w);
                aylik[m] += evAy;
            }
        }
        const yillik = aylik.reduce((a, b) => a + b, 0);
        // 09–17 arası payı (yıllık, enerji ağırlıklı)
        let gunduz = 0;
        for (let m = 0; m < 12; m++) for (let h = 9; h < 17; h++) gunduz += aylik[m] * profil[m][h];
        return { aylik, profil, yillik, kaynak, faturaYillik, evYillik, gunduzPay: yillik > 0 ? gunduz / yillik : 0 };
    }

    // --- SAATLİK SİMÜLASYON -----------------------------------------------------
    // Her ayın tipik günü saat saat: üretim önce eve, artan bataryaya, kalan
    // şebekeye; açık önce bataryadan, kalan şebekeden. Gün, batarya
    // doluluğu gün başında ve sonunda EŞİTLENENE kadar tekrar döndürülüyor.
    //
    // ⚠️ ESKİDEN sabit 3 tur dönüyor, batarya yarı dolu başlıyordu. Büyük
    // bataryada kışın 3 tur bu başlangıç enerjisini tüketmeye yetmiyordu;
    // hiç üretilmemiş enerji "bataryadan" sayılıyor, 25 kWh'lik batarya
    // faturayı 10 kWh'likten DAHA ÇOK düşürüyor görünüyordu (kayıp 173 yerine
    // 48 kWh). Artık boş başlıyor ve periyodik denge şart.
    // bat: { kap (kullanılabilir kWh), taban (yedek için ayrılan kWh), verim }
    function simule(u, t, kwp, bat) {
        const kap = bat && bat.kap > 0 ? bat.kap : 0;
        const taban = kap > 0 ? Math.min(bat.taban || 0, kap) : 0;
        const eta = Math.sqrt(kap > 0 ? (bat.verim || BATARYA_GIDIS_DONUS) : 1);
        const ay = [], gunler = [];
        for (let m = 0; m < 12; m++) {
            const P = u.sekil[m].map(w => kwp * u.aylik[m] / AY_GUN[m] * w);
            const L = t.profil[m].map(w => t.aylik[m] / AY_GUN[m] * w);
            let soc = taban, saatler;
            for (let tur = 0; tur < 60; tur++) {
                const bas = soc;
                saatler = [];
                for (let h = 0; h < 24; h++) {
                    const p = P[h], l = L[h];
                    const r = { p, l, dogrudan: Math.min(p, l), sarj: 0, bataryadan: 0, sebekeden: 0, sebekeye: 0 };
                    if (p >= l) {
                        const artan = p - l;
                        const sarj = kap > 0 ? Math.min(artan, (kap - soc) / eta) : 0;
                        soc += sarj * eta; r.sarj = sarj; r.sebekeye = artan - sarj;
                    } else {
                        const acik = l - p;
                        const ver = kap > 0 ? Math.min(acik, Math.max(0, soc - taban) * eta) : 0;
                        soc -= ver / eta; r.bataryadan = ver; r.sebekeden = acik - ver;
                    }
                    r.soc = soc; saatler.push(r);
                }
                if (Math.abs(soc - bas) < 1e-6) break;
            }
            gunler.push(saatler);
            const top = (k) => saatler.reduce((a, r) => a + r[k], 0) * AY_GUN[m];
            ay.push({ uretim: top('p'), tuketim: top('l'), dogrudan: top('dogrudan'), sarj: top('sarj'),
                      bataryadan: top('bataryadan'), sebekeden: top('sebekeden'), sebekeye: top('sebekeye') });
        }
        const y = {};
        ['uretim', 'tuketim', 'dogrudan', 'sarj', 'bataryadan', 'sebekeden', 'sebekeye'].forEach(k => { y[k] = ay.reduce((a, r) => a + r[k], 0); });
        y.bataryaKaybi = y.sarj - y.bataryadan;          // gidiş-dönüş kaybı
        y.ozTuketim = y.uretim > 0 ? (y.dogrudan + y.bataryadan) / y.uretim : 0;   // üretimin evde kullanılan payı
        y.bagimsizlik = y.tuketim > 0 ? (y.dogrudan + y.bataryadan) / y.tuketim : 0; // tüketimin güneşten karşılanan payı
        return { ay, y, gunler };
    }

    // Fatura etkisi (1. yıl). mahsup: 'aylik' → ay içinde verilen ve çekilen
    // enerji birbirinden düşülür, ay sonu fazla satış bedeliyle alınır.
    // 'saatlik' → çekilen her kWh tarifeden, verilen her kWh satış bedelinden.
    function faturaEtkisi(sim, tarifeTl, satisTl, mahsup) {
        let fatura = 0, fazla = 0, mahsupEdilen = 0;
        sim.ay.forEach(a => {
            if (mahsup === 'saatlik') { fatura += a.sebekeden * tarifeTl - a.sebekeye * satisTl; fazla += a.sebekeye; return; }
            const net = a.sebekeden - a.sebekeye;
            mahsupEdilen += Math.min(a.sebekeden, a.sebekeye);
            if (net >= 0) fatura += net * tarifeTl;
            else { fatura += net * satisTl; fazla += -net; }
        });
        const onceki = sim.y.tuketim * tarifeTl;
        return { onceki, sonraki: fatura, tasarruf: onceki - fatura, fazla, mahsupEdilen };
    }

    // --- KESİNTİ YEDEĞİ ----------------------------------------------------------
    // yukler: [{ ad, secili, adet, w, oran (%), motor }], saat: istenen süre.
    // Formül Batarya aracıyla (battery.js) aynı: kapasite = enerji ÷ DoD ÷ verim.
    function yedek(yukler, saat) {
        const a = A();
        const sec = (yukler || []).filter(y => y.secili && Number(y.adet) > 0 && Number(y.w) > 0);
        const ort = sec.reduce((s, y) => s + y.adet * y.w * (Number(y.oran) || 0) / 100, 0) / 1000;   // kW
        const tepe = sec.reduce((s, y) => s + y.adet * y.w, 0) / 1000;
        const enBuyukMotor = sec.filter(y => y.motor).reduce((m, y) => Math.max(m, y.w), 0) / 1000;
        const kalkis = tepe + enBuyukMotor * MOTOR_KALKIS;
        const sure = Math.max(0, Number(saat) || 0);
        const enerji = ort * sure;
        const nominal = enerji > 0 ? enerji / a.dod / a.invVerim : 0;
        const modul = nominal > 0 ? Math.ceil(nominal / a.modulKwh - 1e-9) : 0;
        return { secili: sec, ort, tepe, kalkis, sure, enerji, nominal, modul,
                 surekliKw: tepe > 0 ? Math.ceil(tepe * a.surge * 10) / 10 : 0 };
    }

    // --- YARDIMCILAR ---------------------------------------------------------------
    function inverterSec(kw) {
        if (!(kw > 0)) return 0;
        for (const s of STD_INVERTER) if (s >= kw - 1e-9) return s;
        return Math.ceil(kw / 10) * 10;
    }
    function tarifeSec(grup, yillik) {
        const g = yillik / 365;
        if (grup === 'ticarethane') return g > 30 ? 'tariffTicarethaneUst' : 'tariffTicarethane';
        if (grup === 'sanayi') return 'tariffSanayi';
        if (grup === 'tarimsal') return 'tariffTarimsal';
        return g > 8 ? 'tariffMesken' : 'tariffMeskenDusuk';
    }
    function geriOdeme(yatirim, tasarruf, tarifeTl) {
        if (!(yatirim > 0) || !(tasarruf > 0)) return { yil: null, birikim: 0 };
        if (typeof window !== 'undefined' && window.epcPayback) {
            // Ortak model: tasarruf, "tarifeden eşdeğer kWh" olarak veriliyor ki
            // zam ve yıpranma Fatura Analizi/Amortisman ile aynı işlensin.
            const r = window.epcPayback({ yatirim, yillikUretim: tasarruf / tarifeTl, birimFiyat: tarifeTl });
            return { yil: r.yil, birikim: r.birikim };
        }
        return { yil: yatirim / tasarruf, birikim: tasarruf * 25 };
    }

    // --- ANALİZ: hepsini birleştirir -----------------------------------------------
    // g: { konum: uretim() girdisi, tuketim: tuketim() girdisi, grup, alan (m²),
    //      sozlesme (kW), hedef: 'yok'|'yedek'|'bagimsiz', yukler, saat,
    //      mahsup, tarifeTl?, satisTl?, batVerim? }
    function analiz(g) {
        const a = A();
        const u = uretim(g.konum);
        const t = tuketim(g.tuketim || {});
        if (!u || !(t.yillik > 0)) return { eksik: !u ? 'konum' : 'tuketim', u, t };

        const tKey = tarifeSec(g.grup, t.yillik);
        const tarifeTl = Number(g.tarifeTl) > 0 ? Number(g.tarifeTl) : tarife(tKey);
        const satisTl = Number(g.satisTl) >= 0 && g.satisTl !== '' && g.satisTl != null
            ? Number(g.satisTl) : tarifeTl * (ENERJI_ORANI[tKey] || 0.35);
        const mahsup = g.mahsup === 'saatlik' ? 'saatlik' : 'aylik';
        const batVerim = Number(g.batVerim) > 0 ? Number(g.batVerim) / 100 : BATARYA_GIDIS_DONUS;

        // --- Boyutlandırma ---
        const kwpDenge = t.yillik / u.yillik;   // yıllık üretim = yıllık tüketim
        let kwpFazlasiz = Infinity;             // hiçbir ay tüketimi aşmayan
        for (let m = 0; m < 12; m++) if (u.aylik[m] > 0) kwpFazlasiz = Math.min(kwpFazlasiz, t.aylik[m] / u.aylik[m]);
        const kisitlar = [];
        let hedefKwp = kwpDenge, kisit = null;
        const alan = Number(g.alan) || 0;
        if (alan > 0) { const k = alan / a.m2PerKwp; kisitlar.push({ k: 'cati', kwp: k }); if (k < hedefKwp) { hedefKwp = k; kisit = 'cati'; } }
        const soz = Number(g.sozlesme) || 0;
        if (soz > 0) { kisitlar.push({ k: 'sozlesme', kwp: soz }); if (soz < hedefKwp) { hedefKwp = soz; kisit = 'sozlesme'; } }

        // Panel sayısı: kısıt yoksa yıllık tüketime EN YAKIN üretimi veren sayı.
        // ⚠️ Eskiden "%2'den fazla aşarsa aşağı yuvarla" kuralı vardı: 300 kWh/ay'lık
        // İstanbul evinde 5. panel %4 aşıyor diye 4 panele düşüyor, karşılama
        // %104 yerine %84 kalıyordu. Çatı ve sözleşme gücü ise AŞILAMAZ — o
        // durumda aşağı yuvarlanır.
        const nAlt = Math.max(1, Math.floor(hedefKwp / a.panelKwp + 1e-9));
        let panel = nAlt;
        if (!kisit) {
            const sapma = (n) => Math.abs(n * a.panelKwp * u.yillik - t.yillik);
            if (sapma(nAlt + 1) < sapma(nAlt)) panel = nAlt + 1;
        }
        const kwp = panel * a.panelKwp;
        const panelFazlasiz = Math.max(1, Math.floor(Math.min(kwpFazlasiz, hedefKwp) / a.panelKwp + 1e-9));
        const kwpFz = panelFazlasiz * a.panelKwp;

        // --- Batarya ---
        const yd = yedek(g.yukler, g.saat);
        const modulKap = a.modulKwh * a.dod;   // bir modülün kullanılabilir kWh'i
        const simYok = simule(u, t, kwp, null);
        // Öz tüketim (bağımsızlık) için verimli kapasite. Modül modül
        // ekleniyor; EKLENEN modül yılda en az MIN_DONGU tam döngü
        // çalışmıyorsa duruluyor.
        // ⚠️ "En büyüğün %80'i" ölçütü denendi ve reddedildi: kışın neredeyse
        // boş duran modülleri de saydığı için 300 kWh/ay'lık eve 25 kWh
        // öneriyordu. Yıllık döngü, bir modülün parasını hak edip
        // etmediğinin doğrudan ölçüsü.
        const egri = [{ modul: 0, bataryadan: simYok.y.bataryadan, bagimsizlik: simYok.y.bagimsizlik, dongu: 0 }];
        let ozModul = 0;
        for (let b = 1; b <= 10; b++) {
            const s = simule(u, t, kwp, { kap: b * modulKap, taban: 0, verim: batVerim });
            const dongu = (s.y.bataryadan - egri[b - 1].bataryadan) / modulKap;
            egri.push({ modul: b, bataryadan: s.y.bataryadan, bagimsizlik: s.y.bagimsizlik, dongu });
            if (dongu >= MIN_DONGU && ozModul === b - 1) ozModul = b;
        }

        const hedef = g.hedef || 'yedek';
        let batModul = 0;
        if (hedef === 'yedek') batModul = yd.modul;
        else if (hedef === 'bagimsiz') batModul = Math.max(yd.modul, ozModul);
        const batNominal = batModul * a.modulKwh;
        const batKap = batModul * modulKap;
        // Yalnız yedek: batarya dolu bekler (döngü yapmaz). Bağımsızlık: döngü
        // yapar ama kesinti için gereken enerji tabanda saklı tutulur.
        const yedekTaban = Math.min(yd.enerji / a.invVerim, batKap * 0.6);
        const sim = (hedef === 'bagimsiz' && batKap > 0)
            ? simule(u, t, kwp, { kap: batKap, taban: yedekTaban, verim: batVerim })
            : simYok;

        // --- İnverter ---
        const invAc = inverterSec(Math.max(kwp / DC_AC, batModul > 0 ? yd.surekliKw : 0));
        const hibrit = batModul > 0;

        // --- Ekonomi ---
        const yatirimHesap = (k, bKwh) => k * tlPerKwp() + bKwh * a.batUsdKwh * kur();
        const senaryo = (ad, k, s, bKwh, aciklama) => {
            const fe = faturaEtkisi(s, tarifeTl, satisTl, mahsup);
            const yat = yatirimHesap(k, bKwh);
            const go = geriOdeme(yat, fe.tasarruf, tarifeTl);
            return { ad, aciklama, kwp: k, panel: Math.round(k / a.panelKwp), batKwh: bKwh,
                     uretim: s.y.uretim, karsilama: s.y.uretim / s.y.tuketim,
                     ozTuketim: s.y.ozTuketim, bagimsizlik: s.y.bagimsizlik,
                     fazla: fe.fazla, tasarruf: fe.tasarruf, onceki: fe.onceki, sonraki: fe.sonraki,
                     yatirim: yat, geriOdeme: go.yil };
            // 25 yıllık net kazanç BİLEREK yok: ortak modeldeki %25 yıllık zam
            // 25 yıl bileşiklenince (×211) ev başına milyonlarca TL çıkıyor —
            // nominal olarak doğru ama okuyanı yanıltan bir rakam.
        };
        const senaryolar = [];
        // Fazla üretimsiz senaryo, önerilenin yarısından küçükse gösterilmiyor:
        // ilkbaharda tüketimi çok düşük evde 1 panellik bir "seçenek" çıkıyordu.
        if (panelFazlasiz < panel && panelFazlasiz >= panel * 0.5) senaryolar.push(senaryo('Fazla üretimsiz', kwpFz, simule(u, t, kwpFz, null), 0,
            'Hiçbir ayda tüketimi aşmaz; her kWh tam tarifeden değerlenir.'));
        senaryolar.push(senaryo('Önerilen', kwp, simYok, 0,
            kisit === 'cati' ? 'Çatı alanının izin verdiği en büyük sistem.'
            : kisit === 'sozlesme' ? 'Sözleşme gücünün izin verdiği en büyük sistem.'
            : 'Yıllık üretim ≈ yıllık tüketim; faturayı mahsuplaşmayla en çok düşüren boy.'));
        if (batModul > 0) senaryolar.push(senaryo('Önerilen + batarya', kwp, sim, batNominal,
            hedef === 'bagimsiz' ? 'Gündüz fazlası akşama taşınır; kesinti yedeği tabanda saklı.' : 'Batarya kesinti için dolu bekler.'));
        const ana = senaryolar[senaryolar.length - 1];

        // Kesintide güneş: en kötü ayın (Aralık-Ocak) ortalama günlük üretimi
        // kritik yüklerin günlük ihtiyacını karşılıyor mu?
        let enAzGunluk = Infinity, enAzAy = 0;
        for (let m = 0; m < 12; m++) { const gu = kwp * u.aylik[m] / AY_GUN[m]; if (gu < enAzGunluk) { enAzGunluk = gu; enAzAy = m; } }

        const uyarilar = [];
        if (soz > 0 && invAc > soz) uyarilar.push('İnverter gücü (' + invAc + ' kW) sözleşme gücünüzü (' + soz + ' kW) aşıyor; dağıtım şirketinden güç artırımı gerekebilir.');
        if (hibrit && yd.kalkis > invAc * 2) uyarilar.push('Kesinti yüklerinin kalkış anı tepe gücü (' + yd.kalkis.toFixed(1) + ' kW) inverterin kısa süreli kapasitesini zorlayabilir; motorlu yükleri aynı anda başlatmayın veya daha güçlü inverter seçin.');
        const bataryaGucu = batModul * a.modulKwh * 0.5;   // modül başına ~0,5C sürekli deşarj varsayımı
        if (hibrit && yd.tepe > bataryaGucu) uyarilar.push('Kesinti yüklerinin toplam gücü (' + yd.tepe.toFixed(1) + ' kW), ' + batModul + ' modülün sürekli verebileceği güce (~' + bataryaGucu.toFixed(1) + ' kW) yakın/üstünde; bir modül eklemek veya yüksek akımlı batarya seçmek gerekebilir.');

        return {
            u, t, tKey, tarifeAd: TARIFE_AD[tKey], tarifeTl, satisTl, mahsup,
            kwpDenge, kwpFazlasiz, hedefKwp, kisit, kisitlar,
            panel, panelKwp: a.panelKwp, kwp, catiM2: kwp * a.m2PerKwp,
            invAc, hibrit, dcAc: invAc > 0 ? kwp / invAc : 0,
            yd, ozModul, egri, hedef, batModul, batNominal, batKap, modulKwh: a.modulKwh,
            yedekSure: yd.ort > 0 && batKap > 0 ? batKap * a.invVerim / yd.ort : 0,
            // Bağımsızlık modunda batarya her gün döngü yapar; kesinti anında
            // yalnız bu taban GARANTİ (dolu batarya değil).
            yedekGarantiSure: hedef === 'bagimsiz' && yd.ort > 0 && batKap > 0 ? yedekTaban * a.invVerim / yd.ort : null,
            sim, simYok, senaryolar, ana,
            enAzGunluk, enAzAy, uyarilar,
            kayipKwh: u.adimlar.map(x => Object.assign({}, x, { farkKwh: x.fark * kwp, sonraKwh: x.sonra * kwp })),
            referansKwh: u.referans * kwp
        };
    }

    // Yön/eğimin optimuma oranı (yıllık, ilin aylık üretimiyle ağırlıklı).
    // Pusula ve eğim göstergesi sürüklenirken HER KAREDE çağrılıyor; bu yüzden
    // saatlik şekil hesaplamıyor, yalnız aylık katsayıları topluyor.
    function yonOrani(il, egim, yuzeyler) {
        const em = (TU_IL[il] || TU_IL['Ankara'])[8];
        let pay = 0, top = 0;
        const f = new Array(12).fill(0);
        yuzeyler.forEach(y => { const k = yonKatsayi(egim, y.az); for (let m = 0; m < 12; m++) f[m] += k[m] * y.pay; });
        for (let m = 0; m < 12; m++) { pay += em[m] * f[m]; top += em[m]; }
        return top > 0 ? pay / top : 0;
    }

    const motor = { TU_IL, AY_AD, AY_GUN, SISTEM_KAYIP, GOLGE, YASAM, PENCERE_AD, TARIFE_AD,
                    yonKatsayi, yonOrani, gunesSekli, uretim, tuketim, simule, faturaEtkisi, yedek,
                    inverterSec, tarifeSec, analiz, cihazYillik, yasamProfili, MEVSIM_DESEN };
    if (typeof window !== 'undefined') window.epcTuMotor = motor;
    if (typeof module !== 'undefined' && module.exports) module.exports = motor;

    // ============================================================================
    //  ARAYÜZ
    //  Görsel ağırlıklı: pusula, eğim kesiti, çatı alanı ızgarası, cihaz
    //  kartları, batarya modülleri ve canlı sonuç çubuğu. Her seçim sonucu
    //  anında değiştirir; animasyonlar "hareketi azalt" tercihinde kapanır.
    // ============================================================================
    if (typeof document === 'undefined') return;
    const root = document.getElementById('tuketimUretimRoot');
    if (!root) return;
    // Geri düğmesi public.js'teki ortak listede bağlı (backButtons). Burada
    // ikinci kez bağlanırsa closeAllAndShowMenu iki kez çalışır: ilki vitrine
    // döner, ikincisi yönetim menüsünü açar.

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const tr = (n, d = 0) => (n != null && isFinite(n)
        ? Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
    const tl = (n) => (n != null && isFinite(n) ? '₺' + tr(Math.round(n)) : '—');
    const yz = (x, d = 0) => (x != null && isFinite(x) ? '%' + tr(x * 100, d) : '—');
    // Gereksiz sıfırsız ondalık: 2,75 · 5,5 · 10
    const sade = (x, d = 2) => tr(x, d).replace(/,?0+$/, '');

    // Grafik renkleri — dataviz doğrulayıcısından geçti (koyu yüzey #1b2e46,
    // bitişik çiftlerde renk körlüğü ΔE ≥ 8,4, kontrast ≥ 3:1). Metin hiçbir
    // zaman seri renginde yazılmıyor; kimliği yanındaki işaret taşıyor.
    // Enerji akışında: güneş (sarı) · batarya (su yeşili) · şebeke (mor).
    const RENK = { uretim: '#c98500', tuketim: '#3987e5', batarya: '#199e70', kayip: '#d95926',
                   sebeke: '#9085e9', izgara: 'rgba(255,255,255,0.08)', eksen: '#A3B5CA', yuzey: '#1b2e46' };

    // --- HAREKET -------------------------------------------------------------------
    // "Hareketi azalt" açıksa yaylar anında hedefe oturur, giriş animasyonları
    // kapanır. Bilgi kaybolmaz; yalnız hareket kalkar.
    const azHareket = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

    // Yay: değeri hedefe fiziksel bir yayla taşır. Sabit süreli geçiş yerine
    // yay, çünkü yarıda yeni hedef gelirse (kullanıcı hızlıca başka yöne
    // tıklarsa) hareket o anki konumundan ve hızından devam eder, sıçramaz.
    // tepki: hedefe varış hızı (sn), sonum: 1 = taşmasız, <1 = hafif salınım.
    function Yay(deger, cb, tepki, sonum) {
        const T = tepki || 0.4, z = sonum == null ? 1 : sonum;
        const k = Math.pow(2 * Math.PI / T, 2), c = 4 * Math.PI * z / T;
        let x = deger, v = 0, hedef = deger, raf = 0, son = 0;
        const adim = (t) => {
            const dt = Math.min(0.032, (t - son) / 1000 || 0.016); son = t;
            v += (-k * (x - hedef) - c * v) * dt; x += v * dt;
            if (Math.abs(x - hedef) < 0.01 && Math.abs(v) < 0.05) { x = hedef; v = 0; raf = 0; cb(x); return; }
            cb(x); raf = requestAnimationFrame(adim);
        };
        return {
            hedefle(h) {
                hedef = h;
                if (azHareket) { x = h; v = 0; cb(x); return; }
                if (!raf) { son = performance.now(); raf = requestAnimationFrame(adim); }
            },
            ayarla(h) { if (raf) cancelAnimationFrame(raf); raf = 0; x = hedef = h; v = 0; cb(x); },  // 1:1 sürükleme
            get deger() { return x; }
        };
    }
    // Sayı göstergeleri: yeni değere yayla sayarak gider (taşmasız).
    const _sayiYay = new WeakMap();
    function sayiYaz(el, hedef, bicim) {
        if (!el) return;
        if (!(isFinite(hedef))) { el.textContent = '—'; _sayiYay.delete(el); return; }
        let y = _sayiYay.get(el);
        if (!y) {
            const bas = Number(el.dataset.sayi);
            y = Yay(isFinite(bas) ? bas : hedef, (x) => { el.textContent = y.bicim(x); }, 0.45, 1);
            _sayiYay.set(el, y);
        }
        y.bicim = bicim;
        el.dataset.sayi = hedef;
        y.hedefle(hedef);
    }

    // --- STİL ----------------------------------------------------------------------
    // Modüle özgü görsel bileşenler. Seçiciler #tuketimUretimRoot ile başlıyor:
    // index.html'deki koyu tema kuralları (body .modul-koyu input …) daha
    // özgül olduğu için kimlik seçicisi olmadan kaydırıcı ve büyük giriş
    // stilleri eziliyordu.
    if (!document.getElementById('tuStil')) {
        const st = document.createElement('style');
        st.id = 'tuStil';
        st.textContent = `
#tuketimUretimRoot{--tu-altin:#FBBF24;--tu-metin:#E8EEF7;--tu-ikincil:#B6C4D7;--tu-soluk:#A3B5CA}
#tuketimUretimRoot .tu-secim{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:14px;padding:12px 14px;cursor:pointer;color:var(--tu-metin);transition:border-color .2s,background-color .2s,box-shadow .2s,transform .1s ease-out;-webkit-tap-highlight-color:transparent}
#tuketimUretimRoot .tu-secim:hover{border-color:rgba(251,191,36,.35)}
#tuketimUretimRoot .tu-secim:active{transform:scale(.97)}
#tuketimUretimRoot .tu-secim[aria-pressed="true"]{border-color:var(--tu-altin);background:rgba(251,191,36,.10);box-shadow:inset 0 0 0 1px var(--tu-altin),0 12px 30px -20px rgba(245,158,11,.8)}
#tuketimUretimRoot .tu-secim .tu-tik{position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;background:var(--tu-altin);color:#0B1B2E;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;transform:scale(0);opacity:0;transition:transform .2s ease-out,opacity .2s}
#tuketimUretimRoot .tu-secim[aria-pressed="true"] .tu-tik{transform:scale(1);opacity:1}
#tuketimUretimRoot .tu-secim .tu-ikon{font-size:22px;line-height:1}
#tuketimUretimRoot .tu-secim .tu-baslik{font-size:13px;font-weight:800;line-height:1.25}
#tuketimUretimRoot .tu-secim .tu-alt{font-size:11px;color:var(--tu-soluk);line-height:1.3}
#tuketimUretimRoot .tu-seg{position:relative;display:inline-flex;padding:4px;border-radius:12px;background:rgba(255,255,255,.06);max-width:100%;overflow-x:auto}
#tuketimUretimRoot .tu-seg button{position:relative;z-index:1;padding:8px 14px;font-weight:800;font-size:13px;color:var(--tu-ikincil);border-radius:9px;white-space:nowrap;transition:color .2s}
#tuketimUretimRoot .tu-seg button[aria-pressed="true"]{color:#0B1B2E}
#tuketimUretimRoot .tu-seg .tu-seg-zemin{position:absolute;top:4px;bottom:4px;left:4px;width:0;border-radius:9px;background:linear-gradient(100deg,#F59E0B,#FBBF24);transition:left .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1)}
#tuketimUretimRoot input.tu-kaydir[type="range"]{-webkit-appearance:none;appearance:none;width:100%;height:6px;padding:0;border:0;border-radius:999px;background:linear-gradient(90deg,#FBBF24 var(--dolu,0%),rgba(255,255,255,.14) var(--dolu,0%));outline:none;cursor:pointer;touch-action:pan-y}
#tuketimUretimRoot input.tu-kaydir[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;border:3px solid #F59E0B;box-shadow:0 4px 12px rgba(0,0,0,.45);transition:transform .1s ease-out}
#tuketimUretimRoot input.tu-kaydir[type="range"]:active::-webkit-slider-thumb{transform:scale(1.15)}
#tuketimUretimRoot input.tu-kaydir[type="range"]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #F59E0B;box-shadow:0 4px 12px rgba(0,0,0,.45)}
#tuketimUretimRoot input.tu-kaydir[type="range"]:focus-visible{box-shadow:0 0 0 3px rgba(251,191,36,.45)}
#tuketimUretimRoot .tu-buyuk{font-size:26px;font-weight:800;padding:10px 14px;border-radius:12px;width:100%;letter-spacing:-.01em}
#tuketimUretimRoot .tu-neden{font-size:12px;line-height:1.5;color:var(--tu-soluk);margin-top:6px}
#tuketimUretimRoot .tu-neden b{color:var(--tu-ikincil)}
#tuketimUretimRoot .tu-etiket{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--tu-soluk);font-weight:800;margin-bottom:8px}
#tuketimUretimRoot .tu-pusula,#tuketimUretimRoot .tu-kesit{width:100%;height:auto;display:block;touch-action:none;user-select:none;-webkit-user-select:none}
#tuketimUretimRoot .tu-pusula .tu-nokta{cursor:pointer}
#tuketimUretimRoot .tu-pusula .tu-nokta circle{transition:r .2s ease-out,fill .2s}
#tuketimUretimRoot .tu-pusula:active{cursor:grabbing}
#tuketimUretimRoot .tu-oku{font-variant-numeric:tabular-nums}
#tuketimUretimRoot .tu-panel-izgara{display:flex;flex-wrap:wrap;gap:3px}
#tuketimUretimRoot .tu-panel-izgara i{display:block;width:12px;height:18px;border-radius:2px;background:linear-gradient(160deg,#4f7cc4,#1e3a6b);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
#tuketimUretimRoot .tu-pop{animation:tuPop .32s ease-out both}
#tuketimUretimRoot .tu-yuksel{transform-box:fill-box;transform-origin:50% 100%;animation:tuYuksel .5s cubic-bezier(.2,.8,.2,1) both}
#tuketimUretimRoot .tu-belir{animation:tuBelir .35s ease-out both}
#tuketimUretimRoot .tu-parla{animation:tuParla .6s ease-out}
#tuketimUretimRoot .tu-modul{position:relative;width:34px;height:52px;border-radius:6px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.05);overflow:hidden}
#tuketimUretimRoot .tu-modul:before{content:"";position:absolute;top:-6px;left:10px;width:10px;height:4px;border-radius:2px 2px 0 0;background:rgba(255,255,255,.35)}
#tuketimUretimRoot .tu-modul i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,#199e70,#34d399);transition:height .5s cubic-bezier(.2,.8,.2,1)}
#tuketimUretimRoot .tu-cubuk{position:sticky;bottom:12px;z-index:30}
#tuketimUretimRoot .tu-ilerleme{position:sticky;top:8px;z-index:31;background:rgba(9,22,38,.86);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:12px 8px 10px;box-shadow:0 18px 40px -24px rgba(0,0,0,.9)}
#tuketimUretimRoot .tu-ilerleme ol{position:relative;display:grid;grid-template-columns:repeat(5,1fr);margin:0;padding:0;list-style:none}
#tuketimUretimRoot .tu-ilerleme-hat{position:absolute;top:17px;left:10%;right:10%;height:4px;border-radius:999px;background:rgba(255,255,255,.12)}
#tuketimUretimRoot .tu-ilerleme-dolu{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#F59E0B,#FBBF24);width:0}
#tuketimUretimRoot .tu-ilerleme button{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;background:none;border:0;cursor:pointer;color:var(--tu-soluk);-webkit-tap-highlight-color:transparent}
#tuketimUretimRoot .tu-ilerleme .tu-nokta2{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;background:#14263d;border:2px solid rgba(255,255,255,.18);color:var(--tu-ikincil);transition:background-color .25s,border-color .25s,transform .1s ease-out,box-shadow .25s}
#tuketimUretimRoot .tu-ilerleme button:active .tu-nokta2{transform:scale(.92)}
#tuketimUretimRoot .tu-ilerleme button:hover .tu-nokta2{border-color:rgba(251,191,36,.6)}
#tuketimUretimRoot .tu-ilerleme button[data-durum="gecti"] .tu-nokta2{background:#F59E0B;border-color:#F59E0B;color:#0B1B2E}
#tuketimUretimRoot .tu-ilerleme button[aria-current="step"] .tu-nokta2{background:#FBBF24;border-color:#FDE68A;color:#0B1B2E;box-shadow:0 0 0 5px rgba(251,191,36,.22)}
#tuketimUretimRoot .tu-ilerleme .tu-ilerleme-ad{font-size:11px;font-weight:800;letter-spacing:.02em}
#tuketimUretimRoot .tu-ilerleme button[aria-current="step"] .tu-ilerleme-ad{color:var(--tu-metin)}
#tuketimUretimRoot .tu-orta{text-align:center}
#tuketimUretimRoot .tu-orta .tu-etiket{text-align:center}
#tuketimUretimRoot .tu-sayfa-gir{animation:tuSayfa .38s cubic-bezier(.2,.8,.2,1) both}
@keyframes tuSayfa{from{opacity:0;transform:translateX(var(--tu-yon,16px))}to{opacity:1;transform:none}}
#tuketimUretimRoot .tu-cubuk-ic{background:rgba(9,22,38,.86);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);border:1px solid rgba(251,191,36,.28);border-radius:16px;box-shadow:0 18px 40px -18px rgba(0,0,0,.9);padding:10px 12px}
#tuketimUretimRoot .tu-akis{display:flex;height:14px;border-radius:999px;overflow:hidden;gap:2px;background:transparent}
#tuketimUretimRoot .tu-akis span{display:block;height:100%;transition:width .5s cubic-bezier(.2,.8,.2,1)}
#tuketimUretimRoot details.tu-acilir>summary{list-style:none;cursor:pointer}
#tuketimUretimRoot details.tu-acilir>summary::-webkit-details-marker{display:none}
#tuketimUretimRoot details.tu-acilir>summary .tu-ok{display:inline-block;transition:transform .25s ease-out}
#tuketimUretimRoot details.tu-acilir[open]>summary .tu-ok{transform:rotate(90deg)}
@keyframes tuPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes tuYuksel{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes tuBelir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes tuParla{0%{color:#FDE68A;text-shadow:0 0 18px rgba(251,191,36,.7)}100%{text-shadow:none}}
@media (prefers-reduced-motion: reduce){
  #tuketimUretimRoot .tu-pop,#tuketimUretimRoot .tu-yuksel,#tuketimUretimRoot .tu-belir,#tuketimUretimRoot .tu-parla,#tuketimUretimRoot .tu-sayfa-gir{animation:none}
  #tuketimUretimRoot *{transition-duration:0s !important}
}
@media (prefers-reduced-transparency: reduce){
  #tuketimUretimRoot .tu-cubuk-ic,#tuketimUretimRoot .tu-ilerleme{background:#0B1B2E;backdrop-filter:none;-webkit-backdrop-filter:none}
}`;
        document.head.appendChild(st);
    }

    // --- HAZIR LİSTELER -------------------------------------------------------------
    // Saat/gün = cihazın TAM GÜÇTE çalıştığı süre (buzdolabı kompresörü
    // günde ~8 saat çalışır; 24 yazılırsa tüketim 3 kat çıkar).
    const CIHAZ_HAZIR = [
        ['🧊', 'Buzdolabı', 1, 120, 8, 'gunboyu', 'tum'],
        ['💡', 'Aydınlatma (LED, toplam)', 1, 120, 5, 'aksam', 'tum'],
        ['📺', 'Televizyon', 1, 100, 5, 'aksam', 'tum'],
        ['📶', 'Modem / internet', 1, 15, 24, 'gunboyu', 'tum'],
        ['🧺', 'Çamaşır makinesi', 1, 1000, 0.7, 'gunduz', 'tum'],
        ['🍽️', 'Bulaşık makinesi', 1, 1100, 0.8, 'aksam', 'tum'],
        ['♨️', 'Elektrikli fırın', 1, 2000, 0.4, 'aksam', 'tum'],
        ['☕', 'Kettle / su ısıtıcı', 1, 2000, 0.2, 'sabah', 'tum'],
        ['💻', 'Bilgisayar / laptop', 1, 80, 4, 'aksam', 'tum'],
        ['👔', 'Ütü', 1, 2000, 0.15, 'aksam', 'tum'],
        ['🧹', 'Elektrikli süpürge', 1, 1400, 0.2, 'gunduz', 'tum'],
        ['❄️', 'Klima', 0, 1200, 6, 'gunduz', 'yaz'],
        ['🚿', 'Elektrikli termosifon', 0, 2500, 1.5, 'sabah', 'tum'],
        ['🌡️', 'Isı pompası / elektrikli ısıtıcı', 0, 2000, 6, 'aksam', 'kis'],
        ['🌀', 'Kurutma makinesi', 0, 2500, 0.6, 'aksam', 'tum'],
        ['🍳', 'Elektrikli ocak / indüksiyon', 0, 2000, 0.8, 'aksam', 'tum'],
        ['💧', 'Hidrofor', 0, 750, 1, 'gunduz', 'tum'],
        ['🥶', 'Derin dondurucu', 0, 100, 8, 'gunboyu', 'tum']
    ].map(([ikon, ad, adet, w, saat, zaman, mevsim]) => ({ ikon, ad, adet, w, saat, zaman, mevsim }));

    // Kesintide çalışacak yükler. Oran = kesinti boyunca ortalama çalışma
    // yüzdesi (buzdolabı kompresörü zamanın ~%40'ında çalışır). Motorlu
    // yükler kalkışta çalışma gücünün ~3 katını çeker; inverter buna göre seçilir.
    const KRITIK_HAZIR = [
        ['🧊', 'Buzdolabı', true, 1, 150, 40, true],
        ['💡', 'Aydınlatma (LED)', true, 1, 60, 100, false],
        ['📶', 'Modem / internet', true, 1, 15, 100, false],
        ['🔥', 'Kombi elektroniği ve pompası', true, 1, 120, 50, true],
        ['📺', 'Televizyon', true, 1, 100, 100, false],
        ['🔌', 'Telefon / laptop şarjı', true, 1, 60, 50, false],
        ['🥶', 'Derin dondurucu', false, 1, 100, 40, true],
        ['💧', 'Hidrofor', false, 1, 750, 15, true],
        ['📹', 'Kamera / alarm', false, 1, 25, 100, false],
        ['❄️', 'Klima', false, 1, 1200, 70, true],
        ['🩺', 'Medikal cihaz', false, 1, 350, 100, true],
        ['🚪', 'Garaj kapısı motoru', false, 1, 400, 5, true]
    ].map(([ikon, ad, secili, adet, w, oran, motor]) => ({ ikon, ad, secili, adet, w, oran, motor }));
    const IKON_TAHMIN = (ad) => { const h = [...CIHAZ_HAZIR, ...KRITIK_HAZIR].find(x => x.ad === ad || ad.indexOf(x.ad.split(' ')[0]) === 0); return h ? h.ikon : '🔌'; };

    // Pusula: 8 ana yön (azimut: 0 güney, −90 doğu, +90 batı — PVGIS kuralı)
    const YON8 = [[0, 'Güney'], [45, 'Güneybatı'], [90, 'Batı'], [135, 'Kuzeybatı'], [180, 'Kuzey'], [-135, 'Kuzeydoğu'], [-90, 'Doğu'], [-45, 'Güneydoğu']];
    const yonAdi = (az) => { let en = YON8[0], f = 999; YON8.forEach(y => { let d = Math.abs(((az - y[0]) % 360 + 540) % 360 - 180); if (d < f) { f = d; en = y; } }); return en[1]; };

    // --- DURUM ------------------------------------------------------------------------
    const kopya = (x) => JSON.parse(JSON.stringify(x));
    const VARSAYILAN = {
        il: '', gpsLat: null, gpsLon: null,
        yonMod: 'tek', az: 0, egim: 30,       // yonMod: tek | db (doğu+batı) | opt (sehpa/arazi)
        golge: 'yok', alan: 0,
        tmod: 'fatura', birim: 'tl', faturaDeger: '', ayAy: false, aylar: new Array(12).fill(''),
        desen: 'dengeli', yasam: 'calisan', cihazlar: kopya(CIHAZ_HAZIR), faturaEsas: true, pasifAcik: false,
        grup: 'mesken', sozlesme: '', evVar: false, evKm: 15000, evZaman: 'gece',
        hedef: 'yedek', yukler: kopya(KRITIK_HAZIR), saat: 4,
        mahsup: 'aylik', kayiplar: {}, batVerim: 92, tarifeTl: '', satisTl: '',
        gunAy: 5, sayfa: 1
    };
    const SAKLA = 'epcTuGirdi.v2';
    let D = kopya(VARSAYILAN);
    // Kullanıcının girdileri bu tarayıcıda hatırlanıyor (yalnız kolaylık;
    // depolama kapalıysa sessizce varsayılanla açılır). v1 kaydı varsa yeni
    // modele taşınıyor: yön çipleri → azimut, aylık kWh → fatura değeri.
    try {
        let k = JSON.parse(localStorage.getItem(SAKLA) || 'null');
        if (!k) {
            const e = JSON.parse(localStorage.getItem('epcTuGirdi.v1') || 'null');
            if (e && typeof e === 'object') {
                const YON_ESKI = { G: 0, GD: -45, GB: 45, D: -90, B: 90, K: 180 };
                k = Object.assign({}, e);
                if (e.uzman) { k.yonMod = 'tek'; k.az = Number(e.azU) || 0; k.egim = Number(e.egimU) || 0; }
                else if (e.yon === 'DB') k.yonMod = 'db';
                else if (e.yon === 'OPT') k.yonMod = 'opt';
                else { k.yonMod = 'tek'; k.az = YON_ESKI[e.yon] != null ? YON_ESKI[e.yon] : 0; }
                if (Number(e.aylikOrt) > 0) { k.birim = 'kwh'; k.faturaDeger = e.aylikOrt; }
                if (Number(e.evKm) > 0) { k.evVar = true; k.evKm = Number(e.evKm); }
                k.alan = Number(e.alan) || 0;
            }
        }
        if (k && typeof k === 'object') {
            Object.keys(VARSAYILAN).forEach(a => {
                if (k[a] === undefined) return;
                if (Array.isArray(VARSAYILAN[a]) !== Array.isArray(k[a])) return;
                D[a] = k[a];
            });
            if (!Array.isArray(D.aylar) || D.aylar.length !== 12) D.aylar = new Array(12).fill('');
            if (D.il && !TU_IL[D.il]) D.il = '';
            // Eski kayıtta km boş olabiliyordu: kart açılınca "0 km" görünüyordu
            if (!(Number(D.evKm) >= 5000 && Number(D.evKm) <= 40000)) D.evKm = VARSAYILAN.evKm;
            if (!(Number(D.saat) >= 1)) D.saat = VARSAYILAN.saat;
            if (!(Number(D.alan) >= 0)) D.alan = 0;
            D.cihazlar.forEach(c => { if (!c.ikon) c.ikon = IKON_TAHMIN(c.ad || ''); });
            D.yukler.forEach(y => { if (!y.ikon) y.ikon = IKON_TAHMIN(y.ad || ''); });
        }
    } catch (e) { /* özel pencere / kapalı depolama */ }
    function sakla() { try { localStorage.setItem(SAKLA, JSON.stringify(D)); } catch (e) { } }

    // --- GİRDİ → MOTOR ---------------------------------------------------------------
    const yuzeyler = () => D.yonMod === 'db' ? [{ az: -90, pay: 0.5 }, { az: 90, pay: 0.5 }] : [{ az: Number(D.az) || 0, pay: 1 }];
    function konumGirdisi() {
        const o = { il: D.il, golge: motor.GOLGE[D.golge] || 0, kayiplar: D.kayiplar, lat: D.gpsLat, lon: D.gpsLon };
        if (D.yonMod === 'opt') { o.egim = 'opt'; o.az = 'opt'; return o; }
        o.egim = Math.round(Number(D.egim) || 0);
        if (D.yonMod === 'db') o.yuzeyler = yuzeyler();
        else o.az = Math.round(Number(D.az) || 0);
        return o;
    }
    // Fatura: ₺ girildiyse kWh'ye çevrilir. Mesken iki kademeli (günde 8 kWh):
    // önce üst kademeyle hesaplanır; sonuç alt kademeye düşüyorsa alt
    // kademenin fiyatıyla yeniden hesaplanır.
    function aylikKwh() {
        const v = Number(D.faturaDeger);
        if (!(v > 0)) return 0;
        if (D.birim !== 'tl') return v;
        const t = (k) => (window.epcTarife ? window.epcTarife(k) : 5.32);
        if (D.grup === 'ticarethane') { const u = v / t('tariffTicarethaneUst'); return u / 30 > 30 ? u : v / t('tariffTicarethane'); }
        if (D.grup === 'sanayi') return v / t('tariffSanayi');
        if (D.grup === 'tarimsal') return v / t('tariffTarimsal');
        const ust = v / t('tariffMesken');
        return ust * 12 / 365 > 8 ? ust : Math.min(v / t('tariffMeskenDusuk'), 8 * 365 / 12);
    }
    function girdi() {
        return {
            konum: konumGirdisi(),
            tuketim: { mod: D.tmod, aylikOrt: aylikKwh(), aylar: D.ayAy ? D.aylar : null,
                       desen: D.desen, yasam: D.yasam, cihazlar: D.cihazlar,
                       faturaEsas: D.faturaEsas, evKm: D.evVar ? D.evKm : 0, evZaman: D.evZaman },
            grup: D.grup, alan: D.alan, sozlesme: D.sozlesme,
            hedef: D.hedef, yukler: D.yukler, saat: D.saat,
            mahsup: D.mahsup, tarifeTl: D.tarifeTl, satisTl: D.satisTl, batVerim: D.batVerim
        };
    }

    // --- BİLEŞENLER ------------------------------------------------------------------
    const neden = (m) => `<p class="tu-neden">💡 <b>Neden soruyoruz?</b> ${m}</p>`;
    const etiket = (m) => `<span class="tu-etiket">${m}</span>`;
    // Seçim kartı (tek seçimli gruplar). aria-pressed durumu taşır; görsel
    // vurgu ve onay işareti CSS'te, basma anında küçülme :active'de.
    const secim = (alan, deger, ikon, baslik, alt, secili) => `
        <button type="button" class="tu-secim" data-tu-sec="${alan}" data-deger="${esc(deger)}" aria-pressed="${!!secili}">
            <span class="tu-tik" aria-hidden="true">✓</span>${ikon ? `<span class="tu-ikon" aria-hidden="true">${ikon}</span>` : ''}
            <span class="tu-baslik">${baslik}</span>${alt ? `<span class="tu-alt">${alt}</span>` : ''}
        </button>`;
    // Kayan zeminli bölmeli seçici
    const seg = (alan, secenekler, deger) => `
        <div class="tu-seg" role="group" data-seg="${alan}"><span class="tu-seg-zemin" aria-hidden="true"></span>${secenekler.map(([v, e]) =>
            `<button type="button" data-tu-sec="${alan}" data-deger="${v}" aria-pressed="${String(deger) === v}">${e}</button>`).join('')}</div>`;
    const kaydirici = (alan, min, max, adim, deger, etiketMetni) =>
        `<input type="range" class="tu-kaydir" data-tu="${alan}" min="${min}" max="${max}" step="${adim}" value="${esc(deger)}" aria-label="${esc(etiketMetni)}" style="--dolu:${((deger - min) / (max - min) * 100).toFixed(1)}%">`;
    const GIRIS = 'w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-amber-500';
    const KUCUK = 'border border-slate-300 px-2 py-1.5 rounded-md text-sm outline-none focus:border-amber-500';
    // Her adım bir SAYFA: ortalı başlık + ortalanmış içerik kartı. Yalnız
    // geçerli sayfa görünür; ilerleme çubuğundan her an istenen sayfaya geçilir.
    const SAYFALAR = [['Başlangıç', '⚡'], ['Çatı', '🏠'], ['Tüketim', '🔌'], ['Kesinti', '🔋'], ['Sonuç', '📊']];
    const adimKarti = (no, baslik, alt, icerik, id) => `
        <section id="${id}" data-sayfa="${no}" class="tu-sayfa ${Number(D.sayfa) === no ? '' : 'hidden'}" aria-labelledby="${id}B">
            <header class="text-center mb-6 max-w-2xl mx-auto">
                <p class="text-xs font-black uppercase tracking-widest text-amber-700">Adım ${no} / ${SAYFALAR.length}</p>
                <h3 id="${id}B" class="text-2xl md:text-3xl font-black text-slate-800 mt-1 leading-tight" tabindex="-1">${baslik}</h3>
                <p class="text-sm text-slate-500 mt-2">${alt}</p>
            </header>
            <div class="bg-white border border-slate-200 rounded-2xl p-4 md:p-8 max-w-5xl mx-auto">${icerik}</div>
        </section>`;
    const ilerlemeHtml = () => `
        <nav id="tuIlerleme" class="tu-ilerleme mb-6 max-w-3xl mx-auto" aria-label="Analiz adımları">
            <ol><span class="tu-ilerleme-hat" aria-hidden="true"><span class="tu-ilerleme-dolu"></span></span>
            ${SAYFALAR.map(([ad, ik], i) => `<li><button type="button" data-tu-sayfa="${i + 1}" aria-label="${i + 1}. adım: ${ad}">
                <span class="tu-nokta2">${ik}</span><span class="tu-ilerleme-ad">${ad}</span></button></li>`).join('')}
            </ol>
        </nav>`;

    const MEVSIM_AD = { tum: 'Tüm yıl', yaz: 'Yaz', kis: 'Kış' };
    const ZAMAN_IKON = { sabah: '🌅 Sabah', gunduz: '☀️ Gündüz', aksam: '🌆 Akşam', gece: '🌙 Gece', gunboyu: '🔁 Gün boyu' };

    // --- İSKELET ----------------------------------------------------------------------
    function iskelet() {
        const iller = Object.keys(TU_IL).sort((a, b) => a.localeCompare(b, 'tr'));
        root.innerHTML = `
        <div class="text-center mb-5">
            <p class="text-slate-800 font-black text-2xl">⚡ Tüketim & Üretim Analizi</p>
            <p class="text-sm text-slate-500 mt-1">5 kısa adım · istediğiniz adıma üstteki çubuktan geçebilirsiniz</p>
        </div>
        ${ilerlemeHtml()}
        <div id="tuGirdiler">
        ${adimKarti(1, 'İki bilgiyle başlayalım', 'Sonucu hemen hesaplamak için yeterli. Sonraki adımlar sonucu hassaslaştırır; atlayabilirsiniz.', `
            <div class="tu-orta max-w-md mx-auto space-y-6">
                <div>
                    ${etiket('İliniz')}
                    <select data-tu="il" class="${GIRIS} tu-buyuk" style="font-size:18px" aria-label="İl">
                        <option value="">İlinizi seçin…</option>
                        ${iller.map(i => `<option value="${esc(i)}" ${D.il === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}
                    </select>
                    <div class="flex items-center justify-center gap-2 mt-2"><button type="button" data-tu-eylem="gps" class="text-xs font-bold text-amber-700 hover:underline">📍 Konumumu kullan</button><span id="tuGpsDurum" class="text-xs text-slate-500"></span></div>
                </div>
                <div>
                    <div class="flex flex-col items-center gap-2 mb-2">${etiket('Aylık elektrik faturanız')} ${seg('birim', [['tl', '₺ tutar'], ['kwh', 'kWh']], D.birim)}</div>
                    <div class="relative">
                        <input data-tu="faturaDeger" type="number" min="0" step="1" inputmode="decimal" placeholder="${D.birim === 'tl' ? 'Örn. 1500' : 'Örn. 300'}" value="${esc(D.faturaDeger)}" class="${GIRIS} tu-buyuk pr-16" aria-label="Aylık ortalama fatura">
                        <span data-birim-etiket class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">${D.birim === 'tl' ? '₺/ay' : 'kWh/ay'}</span>
                    </div>
                    <p id="tuDonusum" class="text-sm text-slate-600 mt-2 tu-oku"></p>
                </div>
            </div>
        `, 'tuSayfa1')}
        ${adimKarti(2, 'Nerede ve nasıl bir çatı?', 'Panelin yılda ne kadar üreteceğini belirler. Bilmediğiniz yeri olduğu gibi bırakın.', `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                <div>
                    ${etiket('İlinizin güneşi')}
                    <div id="tuIlGosterge"></div>
                    ${neden('<span id="tuIlNeden">Güneşlenme ilden ile neredeyse iki kat değişir.</span> Üretimi ilinizin 15 yıllık uydu ışınım verisiyle (PVGIS) hesaplıyoruz.')}
                </div>
                <div id="tuOzetKonum"></div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div class="tu-orta">
                    ${etiket('Panellerin baktığı yön')}
                    <div class="w-60 max-w-full mx-auto">${pusulaSvg()}</div>
                    <p class="tu-oku text-slate-800 mt-2"><b id="tuYonAd" class="text-xl font-black">Güney</b><span class="text-slate-500 text-sm"> · en iyi yönün </span><b id="tuYonOran" class="text-xl font-black text-amber-700">%100</b><span class="text-slate-500 text-sm">'ü</span></p>
                    <p class="text-xs text-slate-500 mt-1">Yöne dokunun ya da evi sürükleyip çevirin.</p>
                    <div class="flex justify-center flex-wrap gap-2 mt-3">
                        ${secim('yonMod', 'db', '↔️', 'Doğu + Batı', 'İki yöne bakan çatı', D.yonMod === 'db')}
                        ${secim('yonMod', 'opt', '📐', 'Düz çatı / arazi', 'Sehpayla en iyi açı', D.yonMod === 'opt')}
                    </div>
                    ${neden('Panel en çok güneye bakarken üretir. Doğu ve batı ~%15–20 daha az üretir ama sabah ya da akşam güçlüdür; akşam tüketimi yüksek evlerde bu bir avantaj olabilir.')}
                </div>
                <div class="tu-orta">
                    ${etiket('Çatı / panel eğimi')}
                    ${kesitSvg()}
                    <div class="flex items-center gap-3 mt-2">
                        <div class="flex-1 relative pt-3">
                            <span id="tuOptIsaret" class="absolute top-0 text-[10px] font-black text-amber-700" style="transform:translateX(-50%)" title="İliniz için en iyi açı">▼</span>
                            ${kaydirici('egim', 0, 60, 1, D.yonMod === 'opt' ? 32 : D.egim, 'Eğim, derece')}
                        </div>
                        <p class="tu-oku text-slate-800 shrink-0 w-28 text-right"><b id="tuEgimDeg" class="text-xl font-black">30°</b><br><span class="text-xs text-slate-500">en iyinin </span><b id="tuEgimOran" class="text-sm font-black text-amber-700">%100</b><span class="text-xs text-slate-500">'ü</span></p>
                    </div>
                    <div class="flex justify-center flex-wrap gap-2 mt-2" id="tuEgimHizli">
                        ${[[0, 'Düz'], [15, '15°'], [30, '30°'], [45, '45°']].map(([e, a]) => `<button type="button" data-tu-egim="${e}" class="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 active:scale-95 transition">${a}</button>`).join('')}
                    </div>
                    ${neden('Panel güneşi ne kadar dik görürse o kadar üretir. Türkiye’de en iyi açı çoğu ilde 30–34°; kiremit çatılar genelde buna yakındır. ▼ işareti ilinizin en iyi açısı.')}
                </div>
            </div>

            <div class="mb-6 tu-orta">
                ${etiket('Çatıya gölge düşüyor mu?')}
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    ${secim('golge', 'yok', '☀️', 'Hayır', 'Gün boyu açık', D.golge === 'yok')}
                    ${secim('golge', 'az', '🌤️', 'Biraz', 'Sabah / akşam · −%3', D.golge === 'az')}
                    ${secim('golge', 'orta', '⛅', 'Orta', 'Günün bir kısmı · −%7', D.golge === 'orta')}
                    ${secim('golge', 'fazla', '🌥️', 'Çok', 'Uzun süre · −%12', D.golge === 'fazla')}
                </div>
                ${neden('Ağaç, komşu bina ya da baca gölgesi yalnız gölgede kalan paneli değil, aynı dizideki diğer panelleri de düşürebilir. Kesin değer keşifte ölçülür.')}
            </div>

            <div class="tu-orta max-w-xl mx-auto">
                ${etiket('Kullanılabilir çatı alanı')}
                <div class="flex items-center gap-3">
                    <div class="flex-1">${kaydirici('alan', 0, 200, 5, D.alan, 'Çatı alanı, metrekare')}</div>
                    <b id="tuAlanDeg" class="tu-oku text-slate-800 w-28 text-right shrink-0">Bilmiyorum</b>
                </div>
                <div id="tuAlanGorsel" class="mt-3"></div>
                ${neden('Önerilen sistemin çatınıza sığmasını sağlar. Panel başına yürüme payıyla ~3 m² gerekir. Bilmiyorsanız en solda bırakın.')}
            </div>
        `, 'tuSayfa2')}

        ${adimKarti(3, 'Ne kadar elektrik kullanıyorsunuz?', 'Sistemi tüketiminize göre boyutlandırırız: küçüğü faturayı sıfırlamaz, gereğinden büyüğün fazlası düşük bedelle satılır.', `
            <div class="mb-6 text-center">${seg('tmod', [['fatura', '🧾 Faturamdan'], ['cihaz', '🔌 Cihaz cihaz']], D.tmod)}</div>

            <div id="tuFaturaKutu" class="${D.tmod === 'fatura' ? '' : 'hidden'}">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                    <div>
                        ${etiket('Aylık tüketiminiz')}
                        <p class="text-sm text-slate-600">Yukarıdaki <b>hızlı başlangıçta</b> girdiğiniz fatura kullanılıyor. Daha hassas sonuç için son 12 ayı tek tek girebilirsiniz.</p>
                        <label class="flex items-center gap-2 text-xs font-bold text-slate-600 mt-2"><input data-tu="ayAy" type="checkbox" ${D.ayAy ? 'checked' : ''} class="w-4 h-4"> Son 12 ayın kWh değerlerini tek tek gireceğim (en hassası)</label>
                        <div id="tuAyAyKutu" class="${D.ayAy ? '' : 'hidden'} grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
                            ${motor.AY_AD.map((a, m) => `<label class="text-[11px] font-bold text-slate-500">${a.slice(0, 3)}<input data-tu-ay="${m}" type="number" min="0" step="1" inputmode="decimal" value="${esc(D.aylar[m])}" class="${KUCUK} w-full mt-1"></label>`).join('')}
                        </div>
                    </div>
                    <div id="tuDesenKutu" class="${D.ayAy ? 'hidden' : ''}">
                        ${etiket('Yıl içinde nasıl değişiyor?')}
                        <div class="grid grid-cols-3 gap-2">
                            ${secim('desen', 'dengeli', '', 'Dengeli', mevsimMini('dengeli'), D.desen === 'dengeli')}
                            ${secim('desen', 'yaz', '', 'Yazın klima', mevsimMini('yaz'), D.desen === 'yaz')}
                            ${secim('desen', 'kis', '', 'Kışın ısınma', mevsimMini('kis'), D.desen === 'kis')}
                        </div>
                        ${neden('Güneş yazın çok, kışın az üretir. Tüketiminizin hangi mevsimde arttığı, yaz fazlasını ve kış açığını belirler.')}
                    </div>
                </div>
                <div class="tu-orta">${etiket('Gündüz evde kim var?')}</div>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    ${secim('yasam', 'calisan', '💼', 'Kimse yok', yasamMini('calisan'), D.yasam === 'calisan')}
                    ${secim('yasam', 'evde', '🏠', 'Evde biri var', yasamMini('evde'), D.yasam === 'evde')}
                    ${secim('yasam', 'evofis', '💻', 'Evden çalışıyorum', yasamMini('evofis'), D.yasam === 'evofis')}
                    ${secim('yasam', 'isyeri', '🏪', 'İş yeri (gündüz)', yasamMini('isyeri'), D.yasam === 'isyeri')}
                </div>
                <div class="tu-orta">${neden('Panel gündüz üretir. Gündüz kullandığınız elektrik doğrudan güneşten gelir ve en çok tasarrufu sağlar; küçük grafiklerde sarı güneşi, mavi tüketimi gösteriyor.')}</div>
            </div>

            <div id="tuCihazKutu" class="${D.tmod === 'cihaz' ? '' : 'hidden'}">
                <p class="text-sm text-slate-600 mb-4 text-center">Kullandığınız cihazlara dokunun; <b>⚙</b> ile adet, güç ve kullanım saatini ayarlayın.</p>
                <div id="tuCihazKartlar" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"></div>
                <button type="button" data-tu-eylem="cihazEkle" class="mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:text-slate-800 active:scale-95 transition">＋ Listede olmayan cihaz ekle</button>
                <div id="tuCihazDuzen" class="mt-3"></div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                    <div id="tuCihazGrafik"></div>
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">${etiket('Faturanızla karşılaştırın (isteğe bağlı)')}</div>
                        <div class="relative">
                            <input data-tu="faturaDeger" type="number" min="0" step="1" inputmode="decimal" placeholder="Aylık ortalama" value="${esc(D.faturaDeger)}" class="${GIRIS} pr-16" aria-label="Aylık ortalama fatura">
                            <span data-birim-etiket class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">${D.birim === 'tl' ? '₺/ay' : 'kWh/ay'}</span>
                        </div>
                        <label class="flex items-start gap-2 text-xs font-bold text-slate-600 mt-3"><input data-tu="faturaEsas" type="checkbox" ${D.faturaEsas ? 'checked' : ''} class="w-4 h-4 mt-0.5"> <span>Toplamı faturamdan al; cihaz listesini yalnız saatlik dağılım için kullan</span></label>
                        <div id="tuNetlestirme"></div>
                    </div>
                </div>
            </div>

            <div class="mt-8 flex flex-col items-center">
                <button type="button" class="tu-secim w-full sm:w-auto" data-tu-sec="evVar" data-deger="${D.evVar ? '0' : '1'}" aria-pressed="${!!D.evVar}">
                    <span class="tu-tik" aria-hidden="true">✓</span><span class="tu-ikon" aria-hidden="true">🚗</span>
                    <span class="tu-baslik">Elektrikli aracım var ya da alacağım</span><span class="tu-alt">Şarj tüketimini sisteme ekleriz</span>
                </button>
                <div id="tuEvKutu" class="${D.evVar ? '' : 'hidden'} mt-4 w-full max-w-2xl grid grid-cols-1 gap-4">
                    <div>
                        <div class="flex items-center gap-3">
                            <div class="flex-1">${kaydirici('evKm', 5000, 40000, 1000, D.evKm, 'Yıllık kilometre')}</div>
                            <b id="tuEvDeg" class="tu-oku text-slate-800 w-40 text-right shrink-0"></b>
                        </div>
                    </div>
                    <div class="flex justify-center flex-wrap gap-2">
                        ${secim('evZaman', 'gece', '🌙', 'Gece şarj', '', D.evZaman === 'gece')}
                        ${secim('evZaman', 'gunduz', '☀️', 'Gündüz şarj', 'Güneşle en uyumlu', D.evZaman === 'gunduz')}
                        ${secim('evZaman', 'aksam', '🌆', 'Akşam şarj', '', D.evZaman === 'aksam')}
                    </div>
                </div>
            </div>

            <details class="tu-acilir mt-5">
                <summary class="text-sm font-bold text-slate-600 text-center"><span class="tu-ok">▸</span> Daha fazla ayrıntı (isteğe bağlı): abone grubu, sözleşme gücü</summary>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
                    <div>
                        ${etiket('Abone grubu')}
                        <div class="grid grid-cols-2 gap-2">
                            ${secim('grup', 'mesken', '🏠', 'Mesken', 'Konut', D.grup === 'mesken')}
                            ${secim('grup', 'ticarethane', '🏪', 'Ticarethane', 'İş yeri', D.grup === 'ticarethane')}
                            ${secim('grup', 'sanayi', '🏭', 'Sanayi', '', D.grup === 'sanayi')}
                            ${secim('grup', 'tarimsal', '🌾', 'Tarımsal', 'Sulama', D.grup === 'tarimsal')}
                        </div>
                        ${neden('Elektrik tarifesi ve ihtiyaç fazlası satış bedeli abone grubuna göre değişir.')}
                    </div>
                    <div>
                        ${etiket('Sözleşme gücü (kW)')}
                        <input data-tu="sozlesme" type="number" min="0" step="0.1" inputmode="decimal" placeholder="Faturanızda yazar" value="${esc(D.sozlesme)}" class="${GIRIS}">
                        ${neden('Kurulu güç bu sınırı aşamaz. Daha büyük sistem için dağıtım şirketinden güç artırımı gerekir.')}
                    </div>
                </div>
            </details>

            <div id="tuOzetTuketim" class="mt-6"></div>
        `, 'tuSayfa3')}

        ${adimKarti(4, 'Elektrik kesilince ne çalışsın?', 'Bataryayı yalnız gerçekten ihtiyacınız olan cihazlara ve süreye göre boyutlandırırız.', `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
                ${secim('hedef', 'yok', '🔌', 'Batarya istemiyorum', 'En düşük yatırım; kesintide sistem kapanır', D.hedef === 'yok')}
                ${secim('hedef', 'yedek', '🔋', 'Kesintide yedek', 'Seçtiğiniz cihazlar kesintide çalışır', D.hedef === 'yedek')}
                ${secim('hedef', 'bagimsiz', '🏝️', 'Yedek + bağımsızlık', 'Gündüz fazlası akşama da taşınır', D.hedef === 'bagimsiz')}
            </div>
            <div id="tuYukKutu" class="${D.hedef === 'yok' ? 'hidden' : ''}">
                <div class="tu-orta max-w-xl mx-auto">
                ${etiket('Kesinti kaç saat sürse dayanmalı?')}
                <div class="flex items-center gap-3">
                    <div class="flex-1">${kaydirici('saat', 1, 48, 1, D.saat, 'Kesinti süresi, saat')}</div>
                    <b id="tuSaatDeg" class="tu-oku text-slate-800 w-20 text-right shrink-0">${D.saat} saat</b>
                </div>
                ${neden('Süre, batarya kapasitesini doğrudan belirler: süreyi ikiye katlamak kapasiteyi de ikiye katlar.')}
                </div>
                <div class="mt-6 tu-orta">${etiket('Kesintide çalışacak cihazlar')}</div>
                <div id="tuYukKartlar" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"></div>
                <button type="button" data-tu-eylem="yukEkle" class="mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:text-slate-800 active:scale-95 transition">＋ Listede olmayan yük ekle</button>
                <div id="tuYukDuzen" class="mt-3"></div>
                <div class="tu-orta">${neden('Yalnız kesintide gerçekten gerekenleri seçin; her cihaz bataryayı büyütür. Motorlu cihazlar (buzdolabı, pompa) kalkışta 3 kat güç çeker, inverter buna göre seçilir.')}</div>
            </div>
            <p id="tuBataryaYokNot" class="${D.hedef === 'yok' ? '' : 'hidden'} text-sm text-slate-500 text-center max-w-xl mx-auto">Bataryasız (on-grid) sistem kesintide güvenlik gereği kapanır; güneş olsa bile evi beslemez. Kesintide çalışmak için hibrit inverter ve batarya gerekir.</p>
            <div id="tuOzetYedek" class="mt-5"></div>
        `, 'tuSayfa4')}

        ${adimKarti(5, 'Size önerdiğimiz sistem', 'Tüketiminiz ve güneş, bir yılın her ayı için saat saat çakıştırıldı.', `
            <div id="tuSonuc"></div>
            <div id="tuGunKutu" class="mt-6"></div>
            <div id="tuSonucAlt"></div>
            <details class="tu-acilir border-t border-slate-200 pt-5 mt-8">
                <summary class="font-black text-slate-800 text-center"><span class="tu-ok">▸</span> ⚙️ Varsayımlar ve gelişmiş ayarlar</summary>
                <div id="tuGelismis" class="mt-4"></div>
            </details>
        `, 'tuSayfa5')}

        <div class="flex items-center justify-center gap-3 mt-6 mb-4">
            <button type="button" data-tu-eylem="geri" id="tuGeri" class="min-w-[9rem] px-5 py-3 rounded-xl font-black text-sm border border-slate-200 bg-slate-100 text-slate-600 active:scale-95 transition">← Geri</button>
            <button type="button" data-tu-eylem="ileri" id="tuIleri" class="min-w-[9rem] px-5 py-3 rounded-xl font-black text-sm bg-amber-500 hover:bg-amber-600 active:scale-95 transition">İleri →</button>
        </div>

        <div class="tu-cubuk max-w-3xl mx-auto" id="tuCubuk" aria-live="polite"><div class="tu-cubuk-ic flex items-center gap-2 sm:gap-3">
            <div id="tuCubukIc" class="flex-1 min-w-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm"></div>
            <button type="button" data-tu-eylem="sonuca" class="shrink-0 bg-amber-500 hover:bg-amber-600 font-black px-3 sm:px-4 py-2.5 rounded-xl text-sm active:scale-95 transition" aria-label="Sonucu gör"><span class="hidden sm:inline">Sonuç </span>→</button>
        </div></div>
        </div>`;
        cubukIskelet();
        cihazKartlariCiz();
        yukKartlariCiz();
        gelismisCiz();
        pusulaKur();
        kesitKur();
        segZeminleri();
    }

    // --- PUSULA ---------------------------------------------------------------------
    // Kuzey yukarıda. Ev yukarıdan görünüyor; paneller evin baktığı yarıda.
    // Azimut (PVGIS): 0 güney, −90 doğu, +90 batı. Ekranda ev rotate(az) ile
    // döner: yerelde panelli yarı aşağı (güneye) bakıyor.
    const PC = 130, PR = 100, PV = 260;   // merkez, halka yarıçapı, görünüm kutusu
    const pusulaNokta = (az, r) => { const b = (az + 180) * Math.PI / 180; return [PC + r * Math.sin(b), PC - r * Math.cos(b)]; };
    function evIcerik(mod) {
        const panel = (x, y) => `<rect x="${x}" y="${y}" width="13" height="9" rx="1.5" fill="#2f5ea8" stroke="rgba(255,255,255,.35)" stroke-width=".8"/>`;
        let p = '';
        if (mod === 'opt') {
            // Düz çatı: güneye eğik sehpa sıraları
            for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++) p += panel(-29 + i * 15, -22 + s * 15);
            return `<rect x="-36" y="-30" width="72" height="60" rx="4" fill="#24384f" stroke="rgba(255,255,255,.25)"/>${p}`;
        }
        const yari = (ust) => { let q = ''; for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) q += panel(-29 + i * 15, (ust ? -25 : 4) + s * 11); return q; };
        return `<rect x="-36" y="-30" width="72" height="60" rx="3" fill="#3a2a22" stroke="rgba(255,255,255,.25)"/>
            <line x1="-36" y1="0" x2="36" y2="0" stroke="rgba(255,255,255,.45)" stroke-width="1.5"/>
            ${mod === 'db' ? yari(true) + yari(false) : yari(false)}
            ${mod === 'db' ? '' : '<path d="M0 34 L-6 44 L6 44 Z" fill="#FBBF24"/>'}`;
    }
    function pusulaSvg() {
        let s = `<svg class="tu-pusula" id="tuPusula" viewBox="0 0 ${PV} ${PV}" role="slider" tabindex="0" aria-label="Panellerin baktığı yön" aria-valuemin="-180" aria-valuemax="180">`;
        s += `<circle cx="${PC}" cy="${PC}" r="${PR}" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/>`;
        // Güneşin gün içi yolu: doğudan doğar, güneyden geçer, batıda batar
        s += `<path d="M ${PC + PR} ${PC} A ${PR} ${PR} 0 0 1 ${PC - PR} ${PC}" fill="none" stroke="#FBBF24" stroke-opacity=".45" stroke-width="2.5" stroke-dasharray="3 6" stroke-linecap="round"/>`;
        const GY = PC + 76;   // öğle güneşi: halkanın içinde, güneyde (halkadaki imleçle çakışmasın)
        s += `<g aria-hidden="true"><circle cx="${PC}" cy="${GY}" r="8" fill="#FBBF24"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r1 = 11, r2 = 14, x = Math.sin(a * Math.PI / 180), y = Math.cos(a * Math.PI / 180); return `<line x1="${PC + x * r1}" y1="${GY + y * r1}" x2="${PC + x * r2}" y2="${GY + y * r2}" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>`; }).join('')}</g>`;
        s += [['K', 0], ['D', 90], ['G', 180], ['B', 270]].map(([h, b]) => { const x = PC + 117 * Math.sin(b * Math.PI / 180), y = PC - 117 * Math.cos(b * Math.PI / 180) + 4.5; return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#A3B5CA">${h}</text>`; }).join('');
        s += `<g id="tuEv" transform="rotate(0 ${PC} ${PC})"><g transform="translate(${PC} ${PC}) scale(1.3)">${evIcerik('tek')}</g></g>`;
        s += YON8.map(([az, ad]) => { const [x, y] = pusulaNokta(az, PR); return `<g class="tu-nokta" data-az="${az}"><title>${ad}</title><circle cx="${x}" cy="${y}" r="5" fill="rgba(255,255,255,.35)"/></g>`; }).join('');
        s += `<circle id="tuYonImlec" cx="${PC}" cy="${PC + PR}" r="7" fill="none" stroke="#FBBF24" stroke-width="2.5"/>`;
        return s + '</svg>';
    }
    let _pusulaYay = null, _evMod = null;
    const enKisaAci = (simdi, hedef) => simdi + ((((hedef - simdi) % 360) + 540) % 360 - 180);
    function pusulaGoster(az, mod, anlik) {
        const ev = document.getElementById('tuEv');
        if (!ev) return;
        if (_evMod !== mod) { ev.firstElementChild.innerHTML = evIcerik(mod); _evMod = mod; }
        const hedef = mod === 'db' ? 90 : mod === 'opt' ? 0 : az;
        if (anlik) _pusulaYay.ayarla(enKisaAci(_pusulaYay.deger, hedef)); else _pusulaYay.hedefle(enKisaAci(_pusulaYay.deger, hedef));
        const [x, y] = pusulaNokta(mod === 'tek' ? az : 0, PR);
        const im = document.getElementById('tuYonImlec');
        if (im) { im.setAttribute('cx', x); im.setAttribute('cy', y); im.style.opacity = mod === 'tek' ? 1 : 0; }
        document.querySelectorAll('#tuPusula .tu-nokta circle').forEach(c => {
            const aktif = mod === 'tek' && Number(c.parentNode.dataset.az) === Math.round(az);
            c.setAttribute('r', aktif ? 6.5 : 5); c.setAttribute('fill', aktif ? '#FBBF24' : 'rgba(255,255,255,.35)');
        });
        const svg = document.getElementById('tuPusula');
        if (svg) { svg.setAttribute('aria-valuenow', Math.round(az)); svg.setAttribute('aria-valuetext', mod === 'db' ? 'Doğu ve batı' : mod === 'opt' ? 'Düz çatı, en iyi açı' : yonAdi(az)); }
        yonOkuTazele(az, mod);
    }
    function yonOkuTazele(az, mod) {
        const ad = document.getElementById('tuYonAd'), or = document.getElementById('tuYonOran');
        if (ad) ad.textContent = mod === 'db' ? 'Doğu + Batı' : mod === 'opt' ? 'Sehpa (en iyi açı)' : yonAdi(az);
        const egim = mod === 'opt' ? (TU_IL[D.il] || TU_IL['Ankara'])[2] : Number(D.egim) || 0;
        const ys = mod === 'db' ? [{ az: -90, pay: .5 }, { az: 90, pay: .5 }] : [{ az: mod === 'opt' ? 0 : az, pay: 1 }];
        const oran = mod === 'opt' ? 1 : motor.yonOrani(D.il, egim, ys);
        sayiYaz(or, oran * 100, (x) => '%' + tr(x));
    }
    function pusulaKur() {
        const ev = document.getElementById('tuEv');
        _evMod = null;
        // Döndürme için hafif salınımlı yay (Apple'ın döndürme değeri: sönüm 0,8)
        _pusulaYay = Yay(D.yonMod === 'tek' ? Number(D.az) || 0 : D.yonMod === 'db' ? 90 : 0,
            (x) => ev && ev.setAttribute('transform', `rotate(${x.toFixed(2)} ${PC} ${PC})`), 0.4, 0.8);
        pusulaGoster(Number(D.az) || 0, D.yonMod, true);
        const svg = document.getElementById('tuPusula');
        if (!svg) return;
        let surukle = false;
        const acidan = (e) => {
            const r = svg.getBoundingClientRect();
            const dx = (e.clientX - r.left) / r.width * PV - PC, dy = (e.clientY - r.top) / r.height * PV - PC;
            if (Math.hypot(dx, dy) < 18) return null;           // merkezde yön belirsiz
            let b = Math.atan2(dx, -dy) * 180 / Math.PI;         // kuzeyden saat yönünde
            let az = ((b - 180) % 360 + 540) % 360 - 180;
            az = Math.round(az / 5) * 5;
            const s45 = Math.round(az / 45) * 45;                 // ana yönlere mıknatıs
            if (Math.abs(az - s45) <= 7) az = s45;
            return az === -180 ? 180 : az;
        };
        const uygula = (az, anlik) => {
            if (az == null) return;
            const degisti = D.yonMod !== 'tek' || Number(D.az) !== az;
            D.yonMod = 'tek'; D.az = az;
            secimleriTazele();
            pusulaGoster(az, 'tek', anlik);
            kesitGoster(Number(D.egim) || 0, true);
            if (degisti && !surukle) planla(0);
        };
        // Basma anında yanıt: dokunulan yöne hemen döner; sürüklerken 1:1 izler
        svg.addEventListener('pointerdown', (e) => { surukle = true; svg.setPointerCapture(e.pointerId); uygula(acidan(e), false); });
        svg.addEventListener('pointermove', (e) => { if (surukle) uygula(acidan(e), true); });
        const birak = () => { if (!surukle) return; surukle = false; planla(0); };
        svg.addEventListener('pointerup', birak);
        svg.addEventListener('pointercancel', birak);
        svg.addEventListener('keydown', (e) => {
            const adim = e.shiftKey ? 5 : 45;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); uygula(((Number(D.az) + adim + 540) % 360) - 180); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); uygula(((Number(D.az) - adim + 540) % 360) - 180); }
        });
    }

    // --- EĞİM KESİTİ ------------------------------------------------------------------
    // Yandan görünüş, güney sağda. Panel GÜNEY kenarından (sağdaki pivot)
    // yükselir; yüzeyi güneye ve güneşe bakar. Ayak çatıya iner. Güneş,
    // ~32°'lik en iyi açıda panel normaline denk gelecek yerde; ışınlar
    // panele ne kadar dik geliyorsa o kadar parlak.
    // ⚠️ İlk çizimde pivot soldaydı: panel kuzeye, güneşin TERSİNE bakıyordu.
    const KX = 212, KY = 128, KL = 130;   // pivot (güney kenarı) ve panel boyu
    const GUNES = [196, 28];
    function kesitSvg() {
        return `<svg class="tu-kesit" id="tuKesit" viewBox="0 0 260 168" aria-hidden="true">
            <defs><linearGradient id="tuGok" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24" stop-opacity=".10"/><stop offset="1" stop-color="#FBBF24" stop-opacity="0"/></linearGradient></defs>
            <rect x="0" y="0" width="260" height="168" fill="url(#tuGok)" rx="12"/>
            <text x="250" y="${KY + 26}" text-anchor="end" font-size="10" font-weight="800" fill="#A3B5CA">G</text>
            <text x="10" y="${KY + 26}" font-size="10" font-weight="800" fill="#A3B5CA">K</text>
            <g id="tuIsinlar" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 5"></g>
            <circle cx="${GUNES[0]}" cy="${GUNES[1]}" r="13" fill="#FBBF24"/>
            <rect x="28" y="${KY}" width="196" height="30" rx="3" fill="#24384f" stroke="rgba(255,255,255,.2)"/>
            <rect x="56" y="${KY + 10}" width="16" height="12" rx="1" fill="rgba(251,191,36,.35)"/><rect x="170" y="${KY + 10}" width="16" height="12" rx="1" fill="rgba(251,191,36,.35)"/>
            <line x1="6" y1="${KY + 30}" x2="254" y2="${KY + 30}" stroke="rgba(255,255,255,.25)"/>
            <line id="tuOptCizgi" x1="${KX}" y1="${KY}" x2="${KX - KL}" y2="${KY}" stroke="#FBBF24" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3 4"/>
            <line id="tuAyak" x1="${KX - KL}" y1="${KY}" x2="${KX - KL}" y2="${KY}" stroke="#A3B5CA" stroke-width="3" stroke-linecap="round"/>
            <path id="tuAciYay" fill="none" stroke="#FBBF24" stroke-width="1.5"/>
            <text id="tuAciYazi" font-size="12" font-weight="800" fill="#E8EEF7" text-anchor="middle"></text>
            <g id="tuPanelG"><rect x="${KX - KL}" y="${KY - 7}" width="${KL}" height="7" rx="2" fill="#2f5ea8" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
                <rect id="tuPanelParla" x="${KX - KL}" y="${KY - 7}" width="${KL}" height="7" rx="2" fill="#FBBF24" opacity="0"/></g>
            <circle cx="${KX}" cy="${KY}" r="3.5" fill="#E8EEF7"/>
        </svg>`;
    }
    let _kesitYay = null;
    function kesitCiz(t) {
        const g = document.getElementById('tuPanelG');
        if (!g) return;
        const r = t * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        g.setAttribute('transform', `rotate(${t.toFixed(2)} ${KX} ${KY})`);
        const ex = KX - KL * c, ey = KY - KL * s;
        const ayak = document.getElementById('tuAyak');
        ayak.setAttribute('x1', ex.toFixed(1)); ayak.setAttribute('y1', ey.toFixed(1)); ayak.setAttribute('x2', ex.toFixed(1));
        ayak.style.opacity = t > 1 ? 1 : 0;
        const ar = 30;
        document.getElementById('tuAciYay').setAttribute('d', `M ${KX - ar} ${KY} A ${ar} ${ar} 0 0 1 ${(KX - ar * c).toFixed(1)} ${(KY - ar * s).toFixed(1)}`);
        const yazi = document.getElementById('tuAciYazi');
        yazi.setAttribute('x', (KX - 46 * Math.cos(r / 2)).toFixed(1)); yazi.setAttribute('y', (KY - 46 * Math.sin(r / 2) + 4).toFixed(1));
        yazi.textContent = Math.round(t) + '°';
        const mx = KX - KL / 2 * c, my = KY - KL / 2 * s;
        const nx = s, ny = -c;                                   // panel normali (güneye-yukarı)
        let gx = GUNES[0] - mx, gy = GUNES[1] - my; const gu = Math.hypot(gx, gy); gx /= gu; gy /= gu;
        const dik = Math.max(0, nx * gx + ny * gy);
        const isin = document.getElementById('tuIsinlar');
        isin.innerHTML = [-0.3, 0, 0.3].map(o => {
            return `<line x1="${GUNES[0] - 8}" y1="${GUNES[1] + 10}" x2="${(mx + o * KL * c).toFixed(1)}" y2="${(my + o * KL * s).toFixed(1)}"/>`;
        }).join('');
        isin.setAttribute('stroke-opacity', (0.15 + 0.7 * Math.pow(dik, 3)).toFixed(2));
        document.getElementById('tuPanelParla').setAttribute('opacity', (0.45 * Math.pow(dik, 6)).toFixed(2));
    }
    function kesitGoster(egim, anlik) {
        if (!_kesitYay) return;
        if (anlik) _kesitYay.ayarla(egim); else _kesitYay.hedefle(egim);
        const opt = (TU_IL[D.il] || TU_IL['Ankara'])[2];
        const o = document.getElementById('tuOptCizgi'), r = opt * Math.PI / 180;
        if (o) { o.setAttribute('x2', (KX - KL * Math.cos(r)).toFixed(1)); o.setAttribute('y2', (KY - KL * Math.sin(r)).toFixed(1)); }
        const isaret = document.getElementById('tuOptIsaret');
        if (isaret) { isaret.style.left = (opt / 60 * 100) + '%'; isaret.title = 'İliniz için en iyi açı: ' + opt + '°'; }
        const deg = document.getElementById('tuEgimDeg');
        if (deg) deg.textContent = Math.round(egim) + '°';
        const ys = D.yonMod === 'db' ? [{ az: -90, pay: .5 }, { az: 90, pay: .5 }] : [{ az: D.yonMod === 'opt' ? 0 : Number(D.az) || 0, pay: 1 }];
        sayiYaz(document.getElementById('tuEgimOran'), (D.yonMod === 'opt' ? 1 : motor.yonOrani(D.il, egim, ys)) * 100, (x) => '%' + tr(x));
        const k = root.querySelector('input[data-tu="egim"]');
        if (k) { k.value = Math.round(egim); k.style.setProperty('--dolu', (egim / 60 * 100).toFixed(1) + '%'); }
    }
    function kesitKur() {
        const bas = D.yonMod === 'opt' ? (TU_IL[D.il] || TU_IL['Ankara'])[2] : Number(D.egim) || 0;
        _kesitYay = Yay(bas, kesitCiz, 0.4, 1);
        kesitGoster(bas, true);
    }

    // --- MİNİ GRAFİKLER ------------------------------------------------------------------
    // Kart içi küçük çizimler: tüketimin yıl içi şekli ve günün saatlerine
    // dağılımı. Sayısal okuma için değil, seçenekleri GÖZLE ayırt etmek için.
    function mevsimMini(desen) {
        const f = motor.MEVSIM_DESEN[desen];
        const v = Array.from({ length: 12 }, (_, m) => f(m)), mx = Math.max(...v);
        return `<svg viewBox="0 0 72 24" width="72" height="24" aria-hidden="true" style="display:block;margin-top:2px">${v.map((x, m) => { const h = 4 + x / mx * 18; return `<rect x="${m * 6}" y="${24 - h}" width="4.5" height="${h}" rx="1" fill="${RENK.tuketim}"/>`; }).join('')}</svg>`;
    }
    let _gunesSekliOrt = null;
    function gunesOrt() {
        // Yıllık ortalama güneş şekli (seçili ilin konumuyla; il yoksa Ankara)
        const il = TU_IL[D.il] || TU_IL['Ankara'];
        const anahtar = il[0] + '|' + il[1];
        if (_gunesSekliOrt && _gunesSekliOrt.k === anahtar) return _gunesSekliOrt.v;
        const s = motor.gunesSekli(il[0], il[1], 30, 0), w = new Array(24).fill(0);
        s.forEach((ay, m) => ay.forEach((x, h) => { w[h] += x * il[8][m]; }));
        _gunesSekliOrt = { k: anahtar, v: w };
        return w;
    }
    function egriYolu(v, W, H, ust) {
        const mx = Math.max(...v) || 1;
        return v.map((x, h) => (h ? 'L' : 'M') + (h / 23 * W).toFixed(1) + ',' + (H - x / mx * (H - (ust || 2))).toFixed(1)).join('');
    }
    function yasamMini(k) {
        const p = motor.yasamProfili(k), g = gunesOrt(), W = 96, H = 26;
        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" style="display:block;margin-top:2px">
            <path d="${egriYolu(g, W, H)}L${W},${H}L0,${H}Z" fill="${RENK.uretim}" fill-opacity=".28"/>
            <path d="${egriYolu(p, W, H)}" fill="none" stroke="${RENK.tuketim}" stroke-width="2" stroke-linejoin="round"/></svg>`;
    }

    // İl göstergesi: ilin güneşliliği Türkiye aralığında nerede?
    let _ilSira = null;
    function ilSira() {
        if (_ilSira) return _ilSira;
        const liste = Object.keys(TU_IL).map(il => ({ il, top: TU_IL[il][8].reduce((a, b) => a + b, 0) })).sort((a, b) => b.top - a.top);
        const enAz = liste[liste.length - 1], enCok = liste[0];
        const net = (il) => { const u = motor.uretim({ il, egim: 'opt', az: 'opt' }); return u ? u.yillik : 0; };
        _ilSira = { liste, enAz: { il: enAz.il, kwh: net(enAz.il) }, enCok: { il: enCok.il, kwh: net(enCok.il) }, min: enAz.top, max: enCok.top };
        return _ilSira;
    }
    function ilGostergeCiz() {
        const s = ilSira();
        const nd = document.getElementById('tuIlNeden');
        if (nd) nd.textContent = `Aynı panel ${s.enAz.il}'da yılda ~${tr(Math.round(s.enAz.kwh / 10) * 10)} kWh, ${s.enCok.il}'da ~${tr(Math.round(s.enCok.kwh / 10) * 10)} kWh üretir.`;
        const kutu = document.getElementById('tuIlGosterge');
        if (!kutu) return;
        if (!D.il) { kutu.innerHTML = '<p class="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3">Yukarıda ilinizi seçince, güneşlilikte Türkiye’nin neresinde olduğunu burada gösteririz.</p>'; return; }
        const i = s.liste.findIndex(x => x.il === D.il);
        const oran = (s.liste[i].top - s.min) / (s.max - s.min);
        kutu.innerHTML = `
            <div class="flex items-baseline justify-between text-xs text-slate-500 mb-1"><span>${esc(s.enAz.il)}</span><span class="font-black text-slate-700">${esc(D.il)}: güneşte 81 il içinde ${i + 1}.</span><span>${esc(s.enCok.il)}</span></div>
            <div style="position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#3b5578,#c98500 60%,#FBBF24)">
                <span class="tu-belir" style="position:absolute;top:50%;left:${(oran * 100).toFixed(1)}%;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #F59E0B;transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(0,0,0,.5);transition:left .5s cubic-bezier(.2,.8,.2,1)"></span>
            </div>`;
    }

    // Çatı alanı: sığan panel sayısı ızgarası; öneri hazırsa kullanılanlar dolu
    let _oncekiPanelSayisi = 0;
    function alanGorselCiz(r) {
        const kutu = document.getElementById('tuAlanGorsel'), deg = document.getElementById('tuAlanDeg');
        const alan = Number(D.alan) || 0;
        const S = window.EPC_SETTINGS || {};
        const pk = Number(S.kwpPerPanel) || 0.55, m2 = Number(S.roofM2PerKwp) || 5.5;
        if (deg) deg.textContent = alan > 0 ? alan + ' m²' : 'Bilmiyorum';
        if (!kutu) return;
        if (!(alan > 0)) { kutu.innerHTML = ''; _oncekiPanelSayisi = 0; return; }
        const sigan = Math.floor(alan / (pk * m2) + 1e-9);
        const kullanilan = r && !r.eksik ? Math.min(r.panel, sigan) : 0;
        const goster = Math.min(sigan, 60);
        let h = '';
        for (let i = 0; i < goster; i++) {
            const dolu = i < kullanilan;
            const yeni = i >= _oncekiPanelSayisi;
            h += `<i class="${yeni ? 'tu-pop' : ''}" style="${dolu ? '' : 'background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)'};${yeni ? `animation-delay:${Math.min(i - _oncekiPanelSayisi, 20) * 18}ms` : ''}"></i>`;
        }
        _oncekiPanelSayisi = goster;
        kutu.innerHTML = `<div class="tu-panel-izgara">${h}${sigan > goster ? `<span class="text-xs text-slate-500 self-end ml-1">+${sigan - goster}</span>` : ''}</div>
            <p class="text-xs text-slate-600 mt-2">En fazla <b>${sigan} panel</b> (${sade(sigan * pk)} kWp) sığar.${kullanilan ? ` Önerilen sistem <b>${kullanilan}</b> tanesini kullanıyor (dolu olanlar).` : ''}</p>`;
    }

    // Bölmeli seçicilerin kayan zemini
    function segZeminleri() {
        root.querySelectorAll('.tu-seg').forEach(s => {
            const b = s.querySelector('button[aria-pressed="true"]'), z = s.querySelector('.tu-seg-zemin');
            if (b && z) { z.style.left = b.offsetLeft + 'px'; z.style.width = b.offsetWidth + 'px'; }
        });
    }
    window.addEventListener('resize', () => { if (root.offsetParent) segZeminleri(); });

    // --- CİHAZ KARTLARI -------------------------------------------------------------
    // Karta dokunmak cihazı açar/kapatır (adet 0 ↔ 1). ⚙ ayar panelini açar.
    // Kart bir <div role="button">: içinde ⚙ düğmesi var ve iç içe <button>
    // HTML'de geçersiz.
    let _cihazSecili = null, _yukSecili = null;
    const tlYil = (kwh) => (window.epcTarife ? window.epcTarife('tariffMesken') : 5.32) * kwh;
    function kart(tur, i, ikon, ad, alt, acik, sayac) {
        return `<div class="tu-secim" role="button" tabindex="0" data-${tur}="${i}" aria-pressed="${acik}" style="min-height:92px">
            <span class="tu-tik" aria-hidden="true">✓</span>
            <span class="tu-ikon" aria-hidden="true">${ikon}</span>
            <span class="tu-baslik">${esc(ad)}${sayac > 1 ? ` <span class="text-amber-700">×${sayac}</span>` : ''}</span>
            <span class="tu-alt">${alt}</span>
            <button type="button" data-${tur}-ayar="${i}" class="absolute bottom-2 right-2 w-7 h-7 rounded-lg text-sm text-slate-400 hover:text-slate-800 hover:bg-slate-100 active:scale-90 transition" aria-label="${esc(ad)} ayarları">⚙</button>
        </div>`;
    }
    // duzenDe === false: açık ayar paneli yeniden çizilmez (içinde yazılan alan
    // odağını kaybetmesin); yalnız kartlar ve grafik yenilenir.
    function cihazKartlariCiz(duzenDe) {
        const k = document.getElementById('tuCihazKartlar');
        if (!k) return;
        k.innerHTML = D.cihazlar.map((c, i) => {
            const acik = Number(c.adet) > 0;
            return kart('cihaz', i, c.ikon || '🔌', c.ad, acik ? tr(motor.cihazYillik(c)) + ' kWh/yıl' : 'Kullanmıyorum', acik, Number(c.adet));
        }).join('');
        // "Diğer cihaz" ızgaranın İÇİNDE değil: 18 kart 2/3/6 sütunda tam satır
        // doluyor; 19. kart son satırda tek başına sola yaslanıyordu.
        if (duzenDe !== false) cihazDuzenCiz();
        cihazGrafikCiz();
    }
    function chipSatiri(veri, alan, secenek, deger) {
        return `<div class="flex flex-wrap gap-1.5">${Object.keys(secenek).map(k => `<button type="button" data-${veri}="${alan}" data-deger="${k}" aria-pressed="${deger === k}" class="text-xs font-bold px-2.5 py-1.5 rounded-lg border active:scale-95 transition ${deger === k ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-100 text-slate-600 border-slate-200'}">${secenek[k]}</button>`).join('')}</div>`;
    }
    function cihazDuzenCiz() {
        const k = document.getElementById('tuCihazDuzen');
        if (!k) return;
        const c = D.cihazlar[_cihazSecili];
        if (!c) { k.innerHTML = ''; return; }
        const yil = motor.cihazYillik(c);
        k.innerHTML = `<div class="tu-belir bg-slate-50 border border-amber-200 rounded-xl p-4">
            <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">${c.ikon || '🔌'}</span>
                <input data-ced="ad" value="${esc(c.ad)}" class="${KUCUK} flex-1 min-w-0 font-bold" aria-label="Cihaz adı">
                <span class="tu-oku text-sm text-slate-600 whitespace-nowrap"><b id="tuCedKwh" class="text-slate-800">${tr(yil)}</b> kWh · <b id="tuCedTl" class="text-slate-800">${tl(tlYil(yil))}</b>/yıl</span>
                <button type="button" data-tu-eylem="duzenKapat" class="text-slate-400 hover:text-slate-800 text-xl px-1" aria-label="Kapat">×</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>${etiket('Adet')}<div class="flex items-center gap-2">
                    <button type="button" data-ced-adim="-1" class="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 font-black active:scale-90 transition" aria-label="Azalt">−</button>
                    <b id="tuCedAdet" class="tu-oku w-8 text-center text-lg text-slate-800">${Number(c.adet) || 0}</b>
                    <button type="button" data-ced-adim="1" class="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 font-black active:scale-90 transition" aria-label="Artır">+</button></div></div>
                <div>${etiket('Güç (W)')}<input data-ced="w" type="number" min="0" step="10" value="${esc(c.w)}" class="${KUCUK} w-full"><p class="tu-neden">Cihazın etiketinde yazar.</p></div>
                <div>${etiket('Tam güçte saat / gün')}<input data-ced="saat" type="number" min="0" max="24" step="0.1" value="${esc(c.saat)}" class="${KUCUK} w-full"><p class="tu-neden">Buzdolabı kompresörü ~8 saat.</p></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div>${etiket('Günün hangi saatinde?')}${chipSatiri('ced-sec', 'zaman', ZAMAN_IKON, c.zaman)}</div>
                <div>${etiket('Hangi mevsimde?')}${chipSatiri('ced-sec', 'mevsim', MEVSIM_AD, c.mevsim)}</div>
            </div>
            <div class="flex justify-between items-center mt-3">
                <p class="tu-neden">Saat bilgisi, tüketimin ne kadarının doğrudan güneşten karşılanacağını belirler.</p>
                <button type="button" data-tu-eylem="cihazSil" class="text-xs font-bold text-red-600 hover:underline shrink-0 ml-2">Listeden çıkar</button>
            </div>
        </div>`;
    }
    // En çok tüketen cihazlar: tek seri, büyükten küçüğe yatay çubuklar
    function cihazGrafikCiz() {
        const k = document.getElementById('tuCihazGrafik');
        if (!k) return;
        const l = D.cihazlar.map(c => ({ c, kwh: motor.cihazYillik(c) })).filter(x => x.kwh > 0).sort((a, b) => b.kwh - a.kwh);
        if (!l.length) { k.innerHTML = ''; return; }
        const ust = l.slice(0, 6), diger = l.slice(6).reduce((s, x) => s + x.kwh, 0), top = l.reduce((s, x) => s + x.kwh, 0);
        if (diger > 0) ust.push({ c: { ikon: '…', ad: 'Diğer ' + (l.length - 6) + ' cihaz' }, kwh: diger });
        const mx = ust[0].kwh;
        k.innerHTML = `${etiket('Tüketiminiz nereye gidiyor?')}
            <div class="space-y-1.5">${ust.map(x => `
                <div class="grid items-center gap-2" style="grid-template-columns:minmax(0,9rem) 1fr 5.5rem">
                    <span class="text-xs text-slate-600 truncate">${x.c.ikon} ${esc(x.c.ad)}</span>
                    <span style="height:10px;border-radius:0 4px 4px 0;background:${RENK.tuketim};width:${(x.kwh / mx * 100).toFixed(1)}%;transition:width .4s cubic-bezier(.2,.8,.2,1)"></span>
                    <span class="text-xs text-right text-slate-700 tu-oku"><b>${tr(x.kwh)}</b> kWh</span>
                </div>`).join('')}</div>
            <p class="text-xs text-slate-500 mt-2">Toplam <b class="text-slate-700">${tr(top)} kWh/yıl</b> · ~${tl(tlYil(top))}/yıl · ayda ~${tr(top / 12)} kWh</p>`;
    }

    // --- KESİNTİ YÜKÜ KARTLARI -------------------------------------------------------------
    function yukKartlariCiz(duzenDe) {
        const k = document.getElementById('tuYukKartlar');
        if (!k) return;
        k.innerHTML = D.yukler.map((y, i) => kart('yuk', i, y.ikon || '🔌', y.ad,
            `${tr(y.w)} W${y.motor ? ' · motorlu' : ''}`, !!y.secili, Number(y.adet))).join('');
        if (duzenDe !== false) yukDuzenCiz();
    }
    function yukDuzenCiz() {
        const k = document.getElementById('tuYukDuzen');
        if (!k) return;
        const y = D.yukler[_yukSecili];
        if (!y) { k.innerHTML = ''; return; }
        k.innerHTML = `<div class="tu-belir bg-slate-50 border border-amber-200 rounded-xl p-4">
            <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">${y.ikon || '🔌'}</span>
                <input data-yed="ad" value="${esc(y.ad)}" class="${KUCUK} flex-1 min-w-0 font-bold" aria-label="Yük adı">
                <button type="button" data-tu-eylem="duzenKapat" class="text-slate-400 hover:text-slate-800 text-xl px-1" aria-label="Kapat">×</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>${etiket('Adet')}<div class="flex items-center gap-2">
                    <button type="button" data-yed-adim="-1" class="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 font-black active:scale-90 transition" aria-label="Azalt">−</button>
                    <b id="tuYedAdet" class="tu-oku w-8 text-center text-lg text-slate-800">${Number(y.adet) || 0}</b>
                    <button type="button" data-yed-adim="1" class="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 font-black active:scale-90 transition" aria-label="Artır">+</button></div></div>
                <div>${etiket('Güç (W)')}<input data-yed="w" type="number" min="0" step="10" value="${esc(y.w)}" class="${KUCUK} w-full"></div>
                <div>${etiket('Çalışma oranı: <b id="tuYedOran">%' + (Number(y.oran) || 0) + '</b>')}${kaydirici('yedOran', 0, 100, 5, Number(y.oran) || 0, 'Çalışma oranı')}
                    <p class="tu-neden">Kesinti boyunca açık kaldığı süre. Buzdolabı ~%40.</p></div>
            </div>
            <div class="flex justify-between items-center mt-3 gap-2">
                <label class="flex items-center gap-2 text-sm font-bold text-slate-600"><input data-yed="motor" type="checkbox" ${y.motor ? 'checked' : ''} class="w-4 h-4"> Motorlu (kalkışta 3 kat güç çeker)</label>
                <button type="button" data-tu-eylem="yukSil" class="text-xs font-bold text-red-600 hover:underline shrink-0">Listeden çıkar</button>
            </div>
        </div>`;
    }

    // --- ÖZETLER ------------------------------------------------------------------------
    const kutuK = (baslik, degerHtml, alt) => `<div class="bg-slate-50 border border-slate-200 p-3 rounded-xl min-w-0"><p class="text-[11px] text-slate-500 font-bold">${baslik}</p><p class="text-lg font-black text-slate-800 mt-0.5 tu-oku">${degerHtml}</p>${alt ? `<p class="text-[11px] text-slate-500 leading-snug">${alt}</p>` : ''}</div>`;
    const _canlandi = new Set();   // ilk görünüşte bir kez büyüyen grafikler
    function ilkKez(id) { if (_canlandi.has(id)) return ''; _canlandi.add(id); return ' tu-yuksel'; }
    // 12 aylık mini sütun grafiği (doğrudan etiket: en yüksek ve en düşük ay)
    function aylikMini(id, v, renk, birim) {
        const W = 300, H = 92, mx = Math.max(...v) || 1, bw = W / 12;
        let enB = 0, enK = 0; v.forEach((x, m) => { if (x > v[enB]) enB = m; if (x < v[enK]) enK = m; });
        const cls = ilkKez(id);
        let s = `<svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Aylık ${birim}" style="width:100%;height:auto;display:block">`;
        v.forEach((x, m) => {
            const h = Math.max(1.5, x / mx * (H - 16)), y = H - h;
            s += `<rect class="${cls.trim()}" style="animation-delay:${m * 25}ms" x="${(m * bw + 3).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${renk}"><title>${motor.AY_AD[m]}: ${tr(x)} ${birim}</title></rect>`;
            if (m === enB || m === enK) s += `<text x="${(m * bw + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#E8EEF7">${tr(x)}</text>`;
            s += `<text x="${(m * bw + bw / 2).toFixed(1)}" y="${H + 12}" text-anchor="middle" font-size="9" fill="${RENK.eksen}">${motor.AY_AD[m].charAt(0)}</text>`;
        });
        return s + '</svg>';
    }

    function konumOzetCiz(r) {
        ilGostergeCiz();
        const u = r.u;
        const k = document.getElementById('tuOzetKonum');
        if (!k) return;
        if (!u) {
            k.innerHTML = `<div class="h-full min-h-[160px] flex items-center justify-center text-center text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5">İlinizi seçin; 1 kWp güneş panelinin<br>orada ay ay ne üreteceğini gösterelim.</div>`;
            return;
        }
        k.innerHTML = `<div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p class="text-xs text-slate-500 font-bold">1 kWp panel ${esc(u.il)}'de yılda</p>
            <p class="font-black text-amber-700 tu-oku" style="font-size:34px;line-height:1.1"><span id="tuKonumKwh">${tr(u.yillik)}</span><span class="text-base"> kWh</span></p>
            <p class="text-[11px] text-slate-500 mb-2">tüm kayıplar düşülmüş · çatı yönü ve eğiminiz dahil</p>
            ${aylikMini('konumAy', u.aylik, RENK.uretim, 'kWh')}
            ${u.kaynak === 'ayar' ? '<p class="text-[11px] text-slate-500 mt-1">Bu il için yöneticimizin girdiği yerinde ölçüm değeri kullanıldı.</p>' : ''}
            ${D.yonMod === 'tek' && Math.abs(Number(D.az)) > 135 ? '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2"><b>Kuzeye bakan çatı önerilmez:</b> üretim belirgin düşer. Mümkünse başka bir yüzey ya da sehpa seçin.</p>' : ''}
        </div>`;
        const kwh = document.getElementById('tuKonumKwh');
        if (kwh) { kwh.dataset.sayi = _onceki.konumKwh != null ? _onceki.konumKwh : u.yillik; sayiYaz(kwh, u.yillik, (x) => tr(x)); _onceki.konumKwh = u.yillik; }
    }
    const _onceki = {};

    function donusumYaz(r) {
        const el = document.getElementById('tuDonusum');
        if (!el) return;
        const v = Number(D.faturaDeger), kwh = aylikKwh();
        if (!(v > 0)) { el.innerHTML = '<span class="text-slate-500">Son faturanızdaki tutarı ya da kWh değerini yazın.</span>'; return; }
        const birimFiyat = r && r.tarifeTl ? r.tarifeTl : (window.epcTarife ? window.epcTarife('tariffMesken') : 5.32);
        el.innerHTML = D.birim === 'tl'
            ? `≈ <b class="text-slate-800">${tr(kwh)} kWh/ay</b> <span class="text-slate-500">· ${r && r.tarifeAd ? esc(r.tarifeAd) + ', ' : ''}₺${sade(birimFiyat)}/kWh ile</span>`
            : `≈ <b class="text-slate-800">${tl(kwh * birimFiyat)}/ay</b> fatura <span class="text-slate-500">· ₺${sade(birimFiyat)}/kWh ile</span>`;
    }

    function tuketimOzetCiz(r) {
        const t = r.t, k = document.getElementById('tuOzetTuketim');
        donusumYaz(r);
        const nk = document.getElementById('tuNetlestirme');
        if (nk) nk.innerHTML = '';
        if (!k) return;
        if (!t || !(t.yillik > 0)) {
            k.innerHTML = '';
            return;
        }
        // Netleştirme: cihaz listesi ile fatura karşılaştırması
        if (D.tmod === 'cihaz' && Number(D.faturaDeger) > 0 && nk) {
            const yalniz = motor.tuketim(Object.assign({}, girdi().tuketim, { faturaEsas: false, evKm: 0 }));
            const fatura = aylikKwh() * 12, fark = yalniz.yillik / fatura - 1, m = Math.abs(fark);
            nk.innerHTML = `<p class="text-xs ${m <= 0.15 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-amber-800 bg-amber-50 border-amber-200'} border rounded-lg p-3 mt-3">
                Liste <b>${tr(yalniz.yillik)}</b> · fatura <b>${tr(fatura)}</b> kWh/yıl. ${m <= 0.15 ? `<b>Uyumlu</b> (fark ${yz(m)}).` : fark < 0 ? `<b>Listeniz ${yz(m)} düşük</b>: unuttuğunuz bir cihaz (termosifon, klima, ısıtıcı) olabilir.` : `<b>Listeniz ${yz(m)} yüksek</b>: süreler ya da güçler fazla girilmiş olabilir.`}</p>`;
        }
        // Gün içi örtüşme: tüketim profili ile güneş şekli (ikisi de yıllık ortalama)
        const g = gunesOrt(), p = new Array(24).fill(0);
        t.profil.forEach((ay, m) => ay.forEach((x, h) => { p[h] += x * t.aylik[m]; }));
        const W = 300, H = 92;
        const gYol = egriYolu(g, W, H, 10), pYol = egriYolu(p, W, H, 10);
        const UST = { mesken: 2000, ticarethane: 20000, sanayi: 500000, tarimsal: 50000 };
        const makul = (t.yillik - t.evYillik) / 12 > (UST[D.grup] || UST.mesken)
            ? `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3"><b>Bu tüketim olağandışı görünüyor</b> (${tr((t.yillik - t.evYillik) / 12)} kWh/ay). Faturadaki <b>sayaç endeksini</b> tüketim yerine yazmış olabilirsiniz — tüketim, iki endeksin farkıdır.</p>` : '';
        k.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p class="text-xs text-slate-500 font-bold">Yıllık tüketiminiz${t.evYillik > 0 ? ' (elektrikli araç dahil)' : ''}</p>
                <p class="font-black text-slate-800 tu-oku" style="font-size:30px;line-height:1.15"><span id="tuTukKwh">${tr(t.yillik)}</span><span class="text-base"> kWh</span></p>
                <p class="text-[11px] text-slate-500 mb-2">ayda ~${tr(t.yillik / 12)} kWh · ${{ fatura: 'faturadan', cihaz: 'cihaz listesinden', 'cihaz+fatura': 'fatura toplamı, cihaz dağılımı' }[t.kaynak] || ''}</p>
                ${aylikMini('tukAy', t.aylik, RENK.tuketim, 'kWh')}
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p class="text-xs text-slate-500 font-bold">Gün içinde güneşle örtüşme</p>
                <p class="font-black text-slate-800 tu-oku" style="font-size:30px;line-height:1.15"><span id="tuGunduzPay">%${tr(t.gunduzPay * 100)}</span><span class="text-sm font-bold text-slate-500"> gündüz (09–17)</span></p>
                <svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Günlük tüketim ve güneş eğrisi" style="width:100%;height:auto;display:block;margin-top:6px">
                    <path d="${gYol}L${W},${H}L0,${H}Z" fill="${RENK.uretim}" fill-opacity=".28"/>
                    <path d="${gYol}" fill="none" stroke="${RENK.uretim}" stroke-width="2"/>
                    <path d="${pYol}" fill="none" stroke="${RENK.tuketim}" stroke-width="2.5" stroke-linejoin="round"/>
                    ${[0, 6, 12, 18, 23].map(h => `<text x="${(h / 23 * W).toFixed(1)}" y="${H + 12}" text-anchor="${h === 0 ? 'start' : h === 23 ? 'end' : 'middle'}" font-size="9" fill="${RENK.eksen}">${String(h).padStart(2, '0')}:00</text>`).join('')}
                </svg>
                <p class="text-[11px] text-slate-500 mt-1"><span style="display:inline-block;width:10px;height:3px;background:${RENK.uretim};vertical-align:middle"></span> güneş · <span style="display:inline-block;width:10px;height:3px;background:${RENK.tuketim};vertical-align:middle"></span> tüketiminiz. Sarı alanın altına düşen tüketim doğrudan güneşten gelir.</p>
            </div>
        </div>${makul}`;
        const kw = document.getElementById('tuTukKwh');
        if (kw) { kw.dataset.sayi = _onceki.tukKwh != null ? _onceki.tukKwh : t.yillik; sayiYaz(kw, t.yillik, (x) => tr(x)); _onceki.tukKwh = t.yillik; }
    }

    // Batarya: modül modül; yeşil dolgu kesinti için ayrılan enerji
    let _oncekiModul = 0;
    function yedekOzetCiz(r) {
        const k = document.getElementById('tuOzetYedek');
        if (!k) return;
        if (D.hedef === 'yok') { k.innerHTML = ''; _oncekiModul = 0; return; }
        const yd = r.yd || motor.yedek(D.yukler, D.saat);
        if (!yd.secili.length) { k.innerHTML = `<p class="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">Kesintide çalışacak en az bir cihaz seçin.</p>`; _oncekiModul = 0; return; }
        const S = window.EPC_SETTINGS || {};
        const modulKwh = Number(S.batteryModule) || 5, dod = Number(S.batteryDod) || 0.9, inv = Number(S.inverterEff) || 0.95;
        const modul = r.eksik ? yd.modul : r.batModul;
        const kullanilir = modulKwh * dod;
        let yedekKwh = yd.enerji / inv;
        let bloklar = '';
        for (let i = 0; i < Math.max(modul, 1); i++) {
            const dolu = Math.max(0, Math.min(1, yedekKwh / kullanilir)); yedekKwh -= kullanilir;
            const yeni = i >= _oncekiModul;
            bloklar += `<div class="tu-modul ${yeni ? 'tu-pop' : ''}" style="${yeni ? `animation-delay:${(i - _oncekiModul) * 70}ms` : ''}"><i style="height:${(dolu * 100).toFixed(0)}%"></i></div>`;
        }
        _oncekiModul = modul;
        const sure = !r.eksik && r.yedekSure > 0 ? r.yedekSure : (yd.ort > 0 ? modul * kullanilir * inv / yd.ort : 0);
        k.innerHTML = `<div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                <div class="flex items-end gap-2 flex-wrap" aria-hidden="true">${bloklar}</div>
                <div class="min-w-0">
                    <p class="font-black text-slate-800 tu-oku" style="font-size:26px;line-height:1.15">${modul} × ${sade(modulKwh)} kWh <span class="text-base">= ${sade(modul * modulKwh)} kWh</span></p>
                    <p class="text-sm text-slate-600">Seçtiğiniz ${yd.secili.length} cihaz ${r.yedekGarantiSure != null ? `doluyken ~<b>${tr(sure)} saat</b> çalışır; her an en az ~<b>${tr(r.yedekGarantiSure)} saat</b>lik enerji saklı tutulur.` : `~<b>${tr(sure)} saat</b> çalışır.`}</p>
                    <p class="text-[11px] text-slate-500 mt-1"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${RENK.batarya};vertical-align:-1px"></span> ${D.saat} saatlik kesinti için gereken enerji</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-4">
                ${kutuK('Ortalama yük', sade(yd.ort) + ' kW', 'kesinti boyunca')}
                ${kutuK('Anlık tepe', sade(yd.tepe) + ' kW', 'hepsi birden açıkken')}
                ${kutuK('Kalkış anı', sade(yd.kalkis) + ' kW', 'motor devreye girerken')}
            </div>
            ${!r.eksik && D.hedef === 'bagimsiz' && r.ozModul > yd.modul ? `<p class="text-xs text-slate-600 mt-3">Kesinti için ${yd.modul} modül yeterdi; gündüz fazlasını akşama taşımak için verimli kapasite <b>${r.ozModul} modül</b> çıktı (eklenen her modül yılda en az 100 tam döngü çalışıyor). Büyük olan seçildi.</p>` : ''}
            ${!r.eksik && r.batModul > 0 ? `<p class="text-xs text-slate-600 mt-3">☀️ <b>Gündüz kesintilerinde paneller de devrede:</b> en zayıf ayda (${motor.AY_AD[r.enAzAy]}) bile sistem günde ~<b>${sade(r.enAzGunluk, 1)} kWh</b> üretir; seçtiğiniz cihazların günlük ihtiyacı ~<b>${sade(yd.ort * 24, 1)} kWh</b>.</p>` : ''}
        </div>`;
    }

    // --- CANLI SONUÇ ÇUBUĞU ------------------------------------------------------------------
    // Girdilerin altında yapışık durur; her seçimde sonuç burada sayarak değişir.
    function cubukIskelet() {
        const k = document.getElementById('tuCubukIc');
        if (!k) return;
        k.innerHTML = `
            <span id="tuCubukEksik" class="text-slate-600"></span>
            <span id="tuCubukDolu" class="hidden flex items-center gap-x-3 sm:gap-x-4 text-[13px] sm:text-sm">
                <span class="whitespace-nowrap">☀️ <b id="tuCbKwp" class="text-base sm:text-lg font-black text-amber-700 tu-oku">0</b> <span class="text-slate-500">kWp<span class="hidden sm:inline"> · <span id="tuCbPanel">0</span> panel</span></span></span>
                <span class="whitespace-nowrap">🔋 <b id="tuCbBat" class="font-black text-slate-800 tu-oku">0</b> <span class="text-slate-500">kWh</span></span>
                <span class="whitespace-nowrap">💰 <b id="tuCbTas" class="font-black text-slate-800 tu-oku">₺0</b><span class="text-slate-500">/yıl<span class="hidden sm:inline"> tasarruf</span></span></span>
            </span>`;
    }
    function cubukCiz(r) {
        const eksik = document.getElementById('tuCubukEksik'), dolu = document.getElementById('tuCubukDolu');
        if (!eksik || !dolu) return;
        if (r.eksik) {
            const tik = (ok, m) => `<span class="${ok ? 'text-slate-500 line-through' : 'text-slate-800 font-bold'}">${ok ? '✓' : '○'} ${m}</span>`;
            eksik.innerHTML = `Sonuç için: ${tik(!!r.u, 'il')} &nbsp;${tik(r.t && r.t.yillik > 0, 'tüketim')}`;
            eksik.classList.remove('hidden'); dolu.classList.add('hidden');
            return;
        }
        eksik.classList.add('hidden'); dolu.classList.remove('hidden');
        const kwp = document.getElementById('tuCbKwp');
        const once = Number(kwp.dataset.sayi);
        sayiYaz(kwp, r.kwp, (x) => sade(x));
        if (isFinite(once) && Math.abs(once - r.kwp) > 1e-6) { kwp.classList.remove('tu-parla'); void kwp.offsetWidth; kwp.classList.add('tu-parla'); }
        document.getElementById('tuCbPanel').textContent = r.panel;
        sayiYaz(document.getElementById('tuCbBat'), r.batNominal, (x) => sade(x, 1));
        sayiYaz(document.getElementById('tuCbTas'), r.ana.tasarruf, (x) => tl(x));
    }
    // --- GELİŞMİŞ AYARLAR -----------------------------------------------------------------
    function gelismisCiz() {
        const kutu = document.getElementById('tuGelismis');
        if (!kutu) return;
        kutu.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <p class="text-sm font-black text-slate-700 mb-2">Sistem kayıpları (%)</p>
                    <p class="text-xs text-slate-500 mb-3">Açısal yansıma, spektral etki ve sıcaklık kaybı ilinize göre PVGIS'ten gelir; aşağıdakiler kurulum kalitesine bağlıdır. Varsayılanların toplamı ~%13; PVGIS'in standart %14 varsayımıyla uyumlu.</p>
                    <div class="space-y-2">
                        ${motor.SISTEM_KAYIP.map(s => `
                        <label class="flex items-center justify-between gap-3 text-sm text-slate-600">
                            <span>${esc(s.ad)}</span>
                            <input data-tu-kayip="${s.k}" type="number" min="0" max="30" step="0.5" value="${esc(D.kayiplar[s.k] != null ? D.kayiplar[s.k] : s.yuzde)}" class="${KUCUK} w-20 text-right">
                        </label>`).join('')}
                    </div>
                </div>
                <div class="space-y-4">
                    <div>
                        <p class="text-sm font-black text-slate-700 mb-2">Mahsuplaşma</p>
                        ${seg('mahsup', [['aylik', 'Aylık (varsayılan)'], ['saatlik', 'Anlık / saatlik']], D.mahsup)}
                        <p class="text-xs text-slate-500 mt-2"><b>Aylık:</b> ay içinde şebekeye verdiğiniz enerji çektiğinizden düşülür, ay sonu fazlası satılır. <b>Saatlik:</b> anlık çekilen her kWh tarifeden ödenir, verilen her kWh satış bedelinden alınır — bu durumda bataryanın parasal değeri artar. Mevzuat değişirse karşılaştırma için.</p>
                    </div>
                    <label class="block text-sm text-slate-600">Elektrik tarifesi (₺/kWh, vergiler dahil)
                        <input data-tu="tarifeTl" type="number" min="0" step="0.01" placeholder="Otomatik" value="${esc(D.tarifeTl)}" class="${GIRIS} mt-1"></label>
                    <label class="block text-sm text-slate-600">İhtiyaç fazlası satış bedeli (₺/kWh)
                        <input data-tu="satisTl" type="number" min="0" step="0.01" placeholder="Otomatik: abone grubunuzun aktif enerji bedeli" value="${esc(D.satisTl)}" class="${GIRIS} mt-1"></label>
                    <label class="block text-sm text-slate-600">Batarya gidiş-dönüş verimi (%)
                        <input data-tu="batVerim" type="number" min="50" max="100" step="1" value="${esc(D.batVerim)}" class="${GIRIS} mt-1"></label>
                    <button type="button" data-tu-eylem="sifirla" class="text-xs font-bold text-red-600 hover:underline">Tüm girdileri sıfırla</button>
                </div>
            </div>
            <div id="tuYontem" class="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500 leading-relaxed space-y-2"></div>`;
    }

    // --- GRAFİKLER (SVG, kütüphanesiz) ---------------------------------------------------
    function guzelAdim(max, n) {
        const kaba = max / (n || 4);
        const p = Math.pow(10, Math.floor(Math.log10(kaba || 1)));
        const k = kaba / p;
        return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
    }
    // Üstü 4 px yuvarlak, tabanı düz sütun
    function sutun(x, y, w, h, renk, cls, gecikme) {
        if (h <= 0.5) return '';
        const r = Math.min(4, h, w / 2), yb = y + h;
        return `<path ${cls ? `class="${cls}" style="animation-delay:${gecikme || 0}ms"` : ''} d="M${x},${yb}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${yb}Z" fill="${renk}"/>`;
    }
    const lejant = (ogeler) => `<div class="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-slate-600">${ogeler.map(o =>
        `<span class="inline-flex items-center gap-1.5">${o.cizgi
            ? `<span style="display:inline-block;width:14px;height:2px;border-radius:1px;background:${o.renk}"></span>`
            : `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${o.renk}"></span>`}${o.ad}</span>`).join('')}</div>`;

    function ipucuKur(sarmal, svg, adet, icerik, cizgi) {
        // Tek ipucu kutusu; işaretçinin x'inden en yakın veri dilimini bulur.
        const kutu = sarmal.querySelector('.tu-ipucu');
        const capraz = cizgi ? svg.querySelector('.tu-capraz') : null;
        const m = svg.dataset;
        const ml = Number(m.ml), pw = Number(m.pw), W = Number(m.w);
        function goster(e) {
            const r = svg.getBoundingClientRect();
            const x = (e.clientX - r.left) * W / r.width;
            const i = Math.max(0, Math.min(adet - 1, Math.floor((x - ml) / (pw / adet))));
            kutu.textContent = '';
            icerik(i).forEach((satir, s) => {
                const d = document.createElement('div');
                d.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap;' + (s === 0 ? 'font-weight:800;margin-bottom:2px' : '');
                if (satir.renk) { const k = document.createElement('span'); k.style.cssText = `display:inline-block;width:12px;height:2px;background:${satir.renk}`; d.appendChild(k); }
                const v = document.createElement('b'); v.textContent = satir.deger || ''; v.style.fontWeight = '800';
                const a = document.createElement('span'); a.textContent = satir.ad || ''; a.style.opacity = '.75';
                if (s === 0) d.appendChild(a); else { d.appendChild(v); d.appendChild(a); }
                kutu.appendChild(d);
            });
            kutu.style.display = 'block';
            const sr = sarmal.getBoundingClientRect();
            let left = e.clientX - sr.left + 12;
            if (left + kutu.offsetWidth > sr.width) left = e.clientX - sr.left - kutu.offsetWidth - 12;
            kutu.style.left = Math.max(0, left) + 'px';
            kutu.style.top = Math.max(0, e.clientY - sr.top - kutu.offsetHeight - 8) + 'px';
            if (capraz) {
                const cx = ml + (i + 0.5) * pw / adet;
                capraz.setAttribute('x1', cx); capraz.setAttribute('x2', cx); capraz.style.display = '';
            }
        }
        svg.addEventListener('pointermove', goster);
        svg.addEventListener('pointerdown', goster);
        svg.addEventListener('pointerleave', () => { kutu.style.display = 'none'; if (capraz) capraz.style.display = 'none'; });
    }
    const IPUCU = '<div class="tu-ipucu" style="display:none;position:absolute;z-index:5;pointer-events:none;background:rgba(4,12,22,.94);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 10px;font-size:12px;color:#E8EEF7;box-shadow:0 10px 30px -10px rgba(0,0,0,.8)"></div>';

    function aylikGrafik(ay, ilkGorunus) {
        const cls = (ilkGorunus || '').trim();
        const W = 680, H = 230, ml = 52, mr = 8, mt = 10, mb = 24, pw = W - ml - mr, ph = H - mt - mb;
        const enCok = Math.max(1, ...ay.map(a => Math.max(a.uretim, a.tuketim)));
        const adim = guzelAdim(enCok, 4), ust = Math.ceil(enCok / adim) * adim;
        const y = (v) => mt + ph - v / ust * ph;
        const bant = pw / 12, bw = Math.min(18, (bant - 10) / 2);
        let s = '';
        for (let v = 0; v <= ust + 1e-9; v += adim) {
            s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${RENK.izgara}" stroke-width="1"/>`;
            s += `<text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${RENK.eksen}" style="font-variant-numeric:tabular-nums">${tr(v)}</text>`;
        }
        ay.forEach((a, m) => {
            const cx = ml + m * bant + bant / 2;
            s += sutun(cx - bw - 1, y(a.uretim), bw, mt + ph - y(a.uretim), RENK.uretim, cls, m * 30);
            s += sutun(cx + 1, y(a.tuketim), bw, mt + ph - y(a.tuketim), RENK.tuketim, cls, m * 30 + 15);
            s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${RENK.eksen}">${motor.AY_AD[m].slice(0, 3)}</text>`;
        });
        return `<div class="tu-grafik" style="position:relative">
            ${lejant([{ ad: 'Üretim', renk: RENK.uretim }, { ad: 'Tüketim', renk: RENK.tuketim }])}
            <svg viewBox="0 0 ${W} ${H}" data-ml="${ml}" data-pw="${pw}" data-w="${W}" role="img" aria-label="Aylık üretim ve tüketim, kWh" style="width:100%;height:auto;display:block;touch-action:pan-y">${s}</svg>
            ${IPUCU}</div>`;
    }

    function gunGrafik(saatler) {
        const W = 680, H = 230, ml = 44, mr = 8, mt = 10, mb = 24, pw = W - ml - mr, ph = H - mt - mb;
        const bat = saatler.some(r => r.bataryadan > 0.001);
        const enCok = Math.max(0.1, ...saatler.map(r => Math.max(r.p, r.l)));
        const adim = guzelAdim(enCok, 4), ust = Math.ceil(enCok / adim) * adim;
        const x = (h) => ml + (h + 0.5) * pw / 24, y = (v) => mt + ph - v / ust * ph;
        const yol = (k) => saatler.map((r, h) => (h ? 'L' : 'M') + x(h).toFixed(1) + ',' + y(r[k]).toFixed(1)).join('');
        let s = '';
        for (let v = 0; v <= ust + 1e-9; v += adim) {
            s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${RENK.izgara}" stroke-width="1"/>`;
            s += `<text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${RENK.eksen}" style="font-variant-numeric:tabular-nums">${sade(v, 1)}</text>`;
        }
        for (let h = 0; h < 24; h += 3) s += `<text x="${x(h)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${RENK.eksen}">${String(h).padStart(2, '0')}:00</text>`;
        s += `<path d="${yol('p')}L${x(23)},${y(0)}L${x(0)},${y(0)}Z" fill="${RENK.uretim}" fill-opacity="0.16"/>`;   // koyu zeminde %10 griye kaçıyordu
        s += `<path d="${yol('p')}" fill="none" stroke="${RENK.uretim}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        s += `<path d="${yol('l')}" fill="none" stroke="${RENK.tuketim}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (bat) s += `<path d="${yol('bataryadan')}" fill="none" stroke="${RENK.batarya}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        s += `<line class="tu-capraz" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" stroke="#E8EEF7" stroke-opacity=".35" stroke-width="1" style="display:none"/>`;
        const ogeler = [{ ad: 'Üretim', renk: RENK.uretim, cizgi: true }, { ad: 'Tüketim', renk: RENK.tuketim, cizgi: true }];
        if (bat) ogeler.push({ ad: 'Bataryadan', renk: RENK.batarya, cizgi: true });
        return `<div class="tu-grafik" style="position:relative">
            ${lejant(ogeler)}
            <svg viewBox="0 0 ${W} ${H}" data-ml="${ml}" data-pw="${pw}" data-w="${W}" role="img" aria-label="Tipik günde saatlik üretim ve tüketim, kW" style="width:100%;height:auto;display:block;touch-action:pan-y">${s}</svg>
            ${IPUCU}</div>`;
    }

    const kutu = (baslik, deger, birim, vurgu, alt) => `
        <div class="${vurgu ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'} border p-3 rounded-xl min-w-0">
            <p class="text-[11px] ${vurgu ? 'text-amber-700' : 'text-slate-500'} font-bold leading-tight">${baslik}</p>
            <p class="text-xl font-black ${vurgu ? 'text-amber-700' : 'text-slate-800'} mt-1">${deger}${birim ? `<span class="text-xs font-bold"> ${birim}</span>` : ''}</p>
            ${alt ? `<p class="text-[11px] text-slate-500 mt-0.5 leading-snug">${alt}</p>` : ''}
        </div>`;
    const bos = (metin) => `<p class="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">${metin}</p>`;
    const yaz = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    // Önerilen sistemin panelleri, tek tek. Sayı değişince yalnız yeni gelenler belirir.
    let _oncekiSonucPanel = 0;
    function panelIzgara(n) {
        const goster = Math.min(n, 48);
        let h = '';
        for (let i = 0; i < goster; i++) {
            const yeni = i >= _oncekiSonucPanel;
            h += `<i class="${yeni ? 'tu-pop' : ''}" style="${yeni ? `animation-delay:${Math.min(i - _oncekiSonucPanel, 24) * 22}ms` : ''}"></i>`;
        }
        _oncekiSonucPanel = goster;
        return h + (n > goster ? `<span class="text-xs text-amber-700 font-black self-end ml-1">+${n - goster}</span>` : '');
    }
    // %100 yığılmış çubuk: parçalar arası 2 px boşluk, etiketler çubuğun altında
    function akisCubugu(baslik, toplam, parcalar) {
        const p = parcalar.filter(x => x.kwh > 0.5);
        return `<div>
            <div class="flex justify-between items-baseline text-sm mb-1.5"><b class="text-slate-800">${baslik}</b><span class="text-xs text-slate-500 tu-oku">${tr(toplam)} kWh/yıl</span></div>
            <div class="tu-akis" role="img" aria-label="${esc(baslik)}: ${p.map(x => x.ad + ' ' + yz(x.kwh / toplam)).join(', ')}">${p.map(x => `<span style="flex:${x.kwh.toFixed(1)} 1 0;min-width:4px;background:${x.renk}"></span>`).join('')}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600">${parcalar.map(x => `<span class="whitespace-nowrap"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${x.renk};vertical-align:-1px"></i> ${x.ad} <b class="text-slate-800">${yz(toplam > 0 ? x.kwh / toplam : 0)}</b> <span class="text-slate-500">· ${tr(x.kwh)} kWh</span></span>`).join('')}</div>
        </div>`;
    }

    function nedenMetni(r) {
        if (r.kisit === 'cati') return `Çatı alanınız (${tr(D.alan)} m²) en fazla ~${sade(r.hedefKwp)} kWp'ye izin veriyor; tüketiminizin tamamı için ${sade(r.kwpDenge)} kWp gerekirdi.`;
        if (r.kisit === 'sozlesme') return `Sözleşme gücünüz (${sade(Number(D.sozlesme))} kW) sistemi sınırlıyor; tüketiminizin tamamı için ${sade(r.kwpDenge)} kWp gerekirdi. Dağıtım şirketinden güç artırımıyla büyütülebilir.`;
        return `Yıllık üretim yıllık tüketiminize en yakın panel sayısıyla eşitlendi. Daha büyük sistemin fazlası tarifeden (₺${sade(r.tarifeTl)}) değil, satış bedelinden (₺${sade(r.satisTl)}/kWh) değerlenir.`;
    }

    function sonucCiz(r) {
        if (r.eksik) {
            const tik = (ok, m) => `<li class="flex items-center gap-2 ${ok ? 'text-slate-500 line-through' : 'text-slate-700'}">${ok ? '✓' : '○'} ${m}</li>`;
            yaz('tuSonuc', `<div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center"><p class="text-3xl mb-2">☀️</p><p class="font-black text-slate-700 mb-2">Sonuç için iki bilgi yeterli</p>
                <ul class="text-sm space-y-1 inline-block text-left">${tik(!!r.u, '1. adımda ilinizi seçin')}${tik(r.t && r.t.yillik > 0, '2. adımda tüketiminizi girin')}</ul></div>`);
            yaz('tuSonucAlt', ''); _oncekiSonucPanel = 0; return;
        }
        const a = r.ana;
        const go = a.geriOdeme != null && typeof window.epcSureMetni === 'function' ? window.epcSureMetni(a.geriOdeme) : (a.geriOdeme != null ? sade(a.geriOdeme, 1) + ' yıl' : '—');
        yaz('tuSonuc', `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <p class="text-xs font-bold text-amber-700">Önerilen kurulu güç</p>
                    <p class="font-black text-amber-700 leading-none mt-2 tu-oku" style="font-size:52px"><span id="tuSonKwp" data-sayi="${_onceki.sonKwp != null ? _onceki.sonKwp : r.kwp}">${sade(_onceki.sonKwp != null ? _onceki.sonKwp : r.kwp)}</span><span class="text-lg font-black"> kWp</span></p>
                    <p class="text-sm font-bold text-slate-700 mt-3">${r.panel} × ${tr(r.panelKwp * 1000)} W panel · ~${tr(r.catiM2)} m² çatı</p>
                    <div class="tu-panel-izgara mt-3" aria-hidden="true">${panelIzgara(r.panel)}</div>
                    <p class="text-xs text-slate-600 mt-3 leading-relaxed">${nedenMetni(r)}</p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${kutu('İnverter', sade(r.invAc), 'kW', false, (r.hibrit ? 'Hibrit (bataryalı)' : 'On-grid') + ' · DC/AC ' + sade(r.dcAc))}
                    ${kutu('Batarya', r.batModul > 0 ? sade(r.batNominal) : 'Yok', r.batModul > 0 ? 'kWh' : '', false, r.batModul > 0 ? r.batModul + ' × ' + sade(r.modulKwh) + ' kWh modül' : 'Kesinti yedeği seçilmedi')}
                    ${kutu('Yıllık üretim', tr(a.uretim), 'kWh', false, 'yıllık tüketim ' + tr(r.t.yillik) + ' kWh')}
                    ${kutu('Tüketimi karşılama', yz(a.karsilama), '', false, 'aylık mahsuplaşmayla')}
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                ${kutu('Anlık öz tüketim', yz(a.ozTuketim), '', false, 'üretimin evde o an kullanılan payı')}
                ${kutu('Şebekeden bağımsızlık', yz(a.bagimsizlik), '', false, 'tüketimin güneşten karşılanan payı')}
                ${kutu('1. yıl tasarruf', `<span id="tuSonTas" data-sayi="${_onceki.sonTas != null ? _onceki.sonTas : a.tasarruf}">${tl(_onceki.sonTas != null ? _onceki.sonTas : a.tasarruf)}</span>`, '', true, 'aylık ~' + tl(a.tasarruf / 12))}
                ${kutu('Geri ödeme', go, '', false, 'yatırım ~' + tl(a.yatirim))}
            </div>
            ${r.uyarilar.length ? `<div class="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">${r.uyarilar.map(x => `<p>⚠️ ${esc(x)}</p>`).join('')}</div>` : ''}

            <div class="mt-6">
                <h4 class="font-black text-slate-800 mb-1">Enerjiniz nereden gelip nereye gidiyor?</h4>
                <p class="text-xs text-slate-500 mb-3">Bir yılın toplamı. Evde o an kullanılan güneş en değerlisidir; şebekeye giden fazla aynı ay içinde çekişinizden düşülür.</p>
                <div class="space-y-4">
                    ${akisCubugu('☀️ Ürettiğiniz güneş enerjisi', r.sim.y.uretim, [
                        { ad: 'Evde o an kullanılan', kwh: r.sim.y.dogrudan, renk: RENK.uretim },
                        { ad: 'Bataryaya', kwh: r.sim.y.sarj, renk: RENK.batarya },
                        { ad: 'Şebekeye', kwh: r.sim.y.sebekeye, renk: RENK.sebeke }])}
                    ${akisCubugu('🏠 Tükettiğiniz enerji', r.sim.y.tuketim, [
                        { ad: 'Doğrudan güneşten', kwh: r.sim.y.dogrudan, renk: RENK.uretim },
                        { ad: 'Bataryadan', kwh: r.sim.y.bataryadan, renk: RENK.batarya },
                        { ad: 'Şebekeden', kwh: r.sim.y.sebekeden, renk: RENK.sebeke }])}
                </div>
            </div>

            <div class="mt-6">
                <h4 class="font-black text-slate-800 mb-1">Ay ay üretim ve tüketim</h4>
                <p class="text-xs text-slate-500 mb-3">Yazın fazla üretim şebekeye gider ve aynı ay içindeki çekişinizden düşülür; kışın açık şebekeden karşılanır.</p>
                ${aylikGrafik(r.sim.ay, ilkKez('sonucAy'))}
                <details class="mt-2"><summary class="text-xs font-bold text-slate-500 cursor-pointer">Tablo olarak göster</summary>
                    <div class="overflow-x-auto mt-2"><table class="w-full text-xs text-slate-600" style="font-variant-numeric:tabular-nums">
                        <thead><tr class="text-slate-400 text-left"><th class="py-1 pr-3">Ay</th><th class="pr-3 text-right">Üretim</th><th class="pr-3 text-right">Tüketim</th><th class="pr-3 text-right">Doğrudan</th><th class="pr-3 text-right">Bataryadan</th><th class="pr-3 text-right">Şebekeden</th><th class="text-right">Şebekeye</th></tr></thead>
                        <tbody>${r.sim.ay.map((x, m) => `<tr class="border-t border-slate-200"><td class="py-1 pr-3">${motor.AY_AD[m]}</td><td class="pr-3 text-right">${tr(x.uretim)}</td><td class="pr-3 text-right">${tr(x.tuketim)}</td><td class="pr-3 text-right">${tr(x.dogrudan)}</td><td class="pr-3 text-right">${tr(x.bataryadan)}</td><td class="pr-3 text-right">${tr(x.sebekeden)}</td><td class="text-right">${tr(x.sebekeye)}</td></tr>`).join('')}
                        <tr class="border-t border-slate-200 font-black text-slate-700"><td class="py-1 pr-3">Yıl</td><td class="pr-3 text-right">${tr(r.sim.y.uretim)}</td><td class="pr-3 text-right">${tr(r.sim.y.tuketim)}</td><td class="pr-3 text-right">${tr(r.sim.y.dogrudan)}</td><td class="pr-3 text-right">${tr(r.sim.y.bataryadan)}</td><td class="pr-3 text-right">${tr(r.sim.y.sebekeden)}</td><td class="text-right">${tr(r.sim.y.sebekeye)}</td></tr></tbody>
                    </table><p class="text-[11px] text-slate-400 mt-1">Tüm değerler kWh.</p></div>
                </details>
            </div>`);
        const kwpEl = document.getElementById('tuSonKwp');
        sayiYaz(kwpEl, r.kwp, (x) => sade(x)); _onceki.sonKwp = r.kwp;
        sayiYaz(document.getElementById('tuSonTas'), a.tasarruf, (x) => tl(x)); _onceki.sonTas = a.tasarruf;
        const svg = document.querySelector('#tuSonuc .tu-grafik svg');
        if (svg) ipucuKur(svg.parentNode, svg, 12, (m) => {
            const x = r.sim.ay[m], fark = x.uretim - x.tuketim;
            return [{ ad: motor.AY_AD[m] },
                    { ad: 'üretim', deger: tr(x.uretim) + ' kWh', renk: RENK.uretim },
                    { ad: 'tüketim', deger: tr(x.tuketim) + ' kWh', renk: RENK.tuketim },
                    { ad: fark >= 0 ? 'fazla (mahsuplaşır)' : 'açık (şebekeden)', deger: (fark >= 0 ? '+' : '−') + tr(Math.abs(fark)) + ' kWh' }];
        }, false);
        altCiz(r);
    }

    function gunCiz() {
        const r = _sonR;
        if (!r || r.eksik) { yaz('tuGunKutu', ''); return; }
        const m = Math.max(0, Math.min(11, Number(D.gunAy) || 0));
        const g = r.sim.gunler[m];
        const top = (k) => g.reduce((s, x) => s + x[k], 0);
        const bat = r.sim.y.bataryadan > 0;
        yaz('tuGunKutu', `
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h4 class="font-black text-slate-800">Tipik bir gün, saat saat</h4>
                <select data-tu="gunAy" class="${KUCUK}" aria-label="Ay">${motor.AY_AD.map((a, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${a}</option>`).join('')}</select>
            </div>
            <p class="text-xs text-slate-500 mb-3">Gündüz kullanmadığınız üretim ${bat ? 'önce bataryayı doldurur, kalanı ' : ''}şebekeye gider; akşam ve gece tüketim ${bat ? 'bataryadan, o bitince ' : ''}şebekeden karşılanır. Değerler saatlik ortalama güç (kW).</p>
            ${gunGrafik(g)}
            <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3">
                ${kutu('Üretim', sade(top('p'), 1), 'kWh')}${kutu('Tüketim', sade(top('l'), 1), 'kWh')}
                ${kutu('Doğrudan', sade(top('dogrudan'), 1), 'kWh')}${kutu('Bataryadan', sade(top('bataryadan'), 1), 'kWh')}
                ${kutu('Şebekeden', sade(top('sebekeden'), 1), 'kWh')}${kutu('Şebekeye', sade(top('sebekeye'), 1), 'kWh')}
            </div>
            <details class="mt-2"><summary class="text-xs font-bold text-slate-500 cursor-pointer">Saat saat tablo</summary>
                <div class="overflow-x-auto mt-2"><table class="w-full text-xs text-slate-600" style="font-variant-numeric:tabular-nums">
                    <thead><tr class="text-slate-400 text-left"><th class="py-1 pr-3">Saat</th><th class="pr-3 text-right">Üretim</th><th class="pr-3 text-right">Tüketim</th><th class="pr-3 text-right">Bataryadan</th><th class="pr-3 text-right">Bataryaya</th><th class="pr-3 text-right">Şebekeden</th><th class="text-right">Şebekeye</th></tr></thead>
                    <tbody>${g.map((x, h) => `<tr class="border-t border-slate-200"><td class="py-1 pr-3">${String(h).padStart(2, '0')}:00</td><td class="pr-3 text-right">${sade(x.p)}</td><td class="pr-3 text-right">${sade(x.l)}</td><td class="pr-3 text-right">${sade(x.bataryadan)}</td><td class="pr-3 text-right">${sade(x.sarj)}</td><td class="pr-3 text-right">${sade(x.sebekeden)}</td><td class="text-right">${sade(x.sebekeye)}</td></tr>`).join('')}</tbody>
                </table><p class="text-[11px] text-slate-400 mt-1">Saatlik ortalama güç, kW (= o saatteki kWh).</p></div>
            </details>`);
        const svg = document.querySelector('#tuGunKutu .tu-grafik svg');
        if (svg) ipucuKur(svg.parentNode, svg, 24, (h) => {
            const x = g[h];
            const satir = [{ ad: String(h).padStart(2, '0') + ':00–' + String(h + 1).padStart(2, '0') + ':00' },
                           { ad: 'üretim', deger: sade(x.p) + ' kW', renk: RENK.uretim },
                           { ad: 'tüketim', deger: sade(x.l) + ' kW', renk: RENK.tuketim }];
            if (bat) satir.push({ ad: 'bataryadan', deger: sade(x.bataryadan) + ' kW', renk: RENK.batarya });
            if (x.sebekeden > 0.005) satir.push({ ad: 'şebekeden', deger: sade(x.sebekeden) + ' kW' });
            if (x.sebekeye > 0.005) satir.push({ ad: 'şebekeye', deger: sade(x.sebekeye) + ' kW' });
            if (x.sarj > 0.005) satir.push({ ad: 'bataryaya', deger: sade(x.sarj) + ' kW' });
            return satir;
        }, true);
    }

    function altCiz(r) {
        // Kayıp şelalesi
        const ref = r.referansKwh;
        let onceki = ref;
        const satir = (ad, kaynak, solYuzde, dilimYuzde, dilimRenk, deger, oran) => `
            <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_9.5rem] gap-x-4 gap-y-1 items-center py-1.5 border-t border-slate-200">
                <div class="text-sm text-slate-700 min-w-0">${ad}${kaynak ? ` <span class="text-[10px] text-slate-400">· ${esc(kaynak)}</span>` : ''}</div>
                <div style="position:relative;height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden">
                    <div style="position:absolute;left:0;top:0;bottom:0;width:${solYuzde}%;background:${RENK.uretim}"></div>
                    ${dilimYuzde > 0 ? `<div style="position:absolute;top:0;bottom:0;left:${solYuzde}%;width:calc(${dilimYuzde}% - 2px);margin-left:2px;background:${dilimRenk}"></div>` : ''}
                </div>
                <div class="text-sm text-right whitespace-nowrap" style="font-variant-numeric:tabular-nums"><b class="text-slate-800">${deger}</b> <span class="text-slate-400 text-xs">${oran}</span></div>
            </div>`;
        let satirlar = satir('<b>Panel yüzeyine gelen güneş enerjisi</b>', 'referans', 100, 0, '', tr(ref) + ' kWh', '');
        r.kayipKwh.forEach(k => {
            const kazanc = k.farkKwh > 0;
            const sonra = onceki + k.farkKwh;
            satirlar += satir(esc(k.ad), k.kaynak,
                (kazanc ? onceki : sonra) / ref * 100, Math.abs(k.farkKwh) / ref * 100,
                kazanc ? RENK.batarya : RENK.kayip,
                (kazanc ? '+' : '−') + tr(Math.abs(k.farkKwh)) + ' kWh', (kazanc ? '+' : '−') + '%' + tr(Math.abs(k.yuzde), 1));
            onceki = sonra;
        });
        satirlar += satir('<b>Kullanılabilir AC elektrik (1. yıl)</b>', '', onceki / ref * 100, 0, '', tr(onceki) + ' kWh', '');
        const bk = r.sim.y.bataryaKaybi;
        const batSatir = bk > 0.5 ? `<p class="text-xs text-slate-600 mt-3">🔋 Ayrıca bataryaya giren ${tr(r.sim.y.sarj)} kWh'in <b>${tr(bk)} kWh</b>'i gidiş-dönüşte kaybolur (verim %${tr(D.batVerim)}). Aylık mahsuplaşmada bu kayıp tasarrufu biraz azaltır; bataryanın değeri kesinti güvencesi ve şebekeden bağımsızlıktır.</p>` : '';
        const yip = typeof window.epcYipranma === 'function' ? window.epcYipranma() : 0.007;
        const ort25 = (1 - Math.pow(1 - yip, 25)) / (25 * yip);

        // Senaryolar
        const sat = (s) => {
            const ana = s === r.ana;
            const go = s.geriOdeme != null && typeof window.epcSureMetni === 'function' ? window.epcSureMetni(s.geriOdeme) : (s.geriOdeme != null ? sade(s.geriOdeme, 1) + ' yıl' : '—');
            return `<tr class="border-t border-slate-200 ${ana ? 'bg-amber-50' : ''}">
                <td class="py-2 pr-3"><b class="${ana ? 'text-amber-700' : 'text-slate-700'}">${esc(s.ad)}</b><span class="block text-[11px] text-slate-500 leading-snug">${esc(s.aciklama)}</span></td>
                <td class="pr-3 text-right whitespace-nowrap">${sade(s.kwp)} kWp${s.batKwh ? `<span class="block text-[11px] text-slate-500">+ ${sade(s.batKwh)} kWh</span>` : ''}</td>
                <td class="pr-3 text-right">${tr(s.uretim)}</td>
                <td class="pr-3 text-right">${yz(s.karsilama)}</td>
                <td class="pr-3 text-right">${yz(s.bagimsizlik)}</td>
                <td class="pr-3 text-right whitespace-nowrap">${tl(s.yatirim)}</td>
                <td class="pr-3 text-right whitespace-nowrap">${tl(s.tasarruf)}</td>
                <td class="text-right whitespace-nowrap">${go}</td></tr>`;
        };
        const S = window.EPC_SETTINGS || {};
        const zam = typeof window.epcEnflasyon === 'function' ? window.epcEnflasyon() : 0.25;

        yaz('tuSonucAlt', `
            <div class="mt-8">
                <h4 class="font-black text-slate-800 mb-1">Kayıp analizi — güneşten prize</h4>
                <p class="text-xs text-slate-500 mb-3">Panel yüzeyine yılda düşen ${tr(ref)} kWh'lik güneş enerjisinin ${tr(onceki)} kWh'i kullanılabilir elektriğe dönüşür. Bu orana <b>performans oranı (PR)</b> denir: sizin sisteminizde <b>${yz(r.u.pr)}</b>; iyi kurulmuş sistemlerde %75–85 arasıdır. Kayıp kalemlerini “Gelişmiş ayarlar”dan değiştirebilirsiniz.</p>
                ${lejant([{ ad: 'Kalan enerji', renk: RENK.uretim }, { ad: 'Kayıp', renk: RENK.kayip }, { ad: 'Kazanç', renk: RENK.batarya }])}
                <div>${satirlar}</div>
                ${batSatir}
                <p class="text-xs text-slate-600 mt-2">📉 Paneller her yıl ~%${tr(yip * 100, 1)} verim kaybeder; 25 yılın ortalama üretimi 1. yılın ~${yz(ort25)}'i kadardır.</p>
            </div>

            <div class="mt-8">
                <h4 class="font-black text-slate-800 mb-1">Senaryo karşılaştırması</h4>
                <p class="text-xs text-slate-500 mb-3">Aynı tüketim için farklı sistem boyları. Vurgulu satır yukarıdaki öneridir.</p>
                <div class="overflow-x-auto"><table class="w-full text-sm text-slate-600" style="font-variant-numeric:tabular-nums;min-width:640px">
                    <thead><tr class="text-[11px] uppercase tracking-wider text-slate-400 text-left">
                        <th class="py-1 pr-3">Senaryo</th><th class="pr-3 text-right">Güç</th><th class="pr-3 text-right">Üretim (kWh)</th><th class="pr-3 text-right">Karşılama</th><th class="pr-3 text-right">Bağımsızlık</th><th class="pr-3 text-right">Yatırım*</th><th class="pr-3 text-right">1. yıl tasarruf</th><th class="text-right">Geri ödeme</th></tr></thead>
                    <tbody>${r.senaryolar.map(sat).join('')}</tbody>
                </table></div>
                <p class="text-[11px] text-slate-400 mt-2">*Gösterge fiyat: panel + inverter kWp başı ~${tl(window.epcTlPerKwp ? window.epcTlPerKwp() : 0)}, batarya kWh başı ~${tl((Number(S.batteryUsdPerKwh) || 300) * (window.epcKur ? window.epcKur() : 0))}; marka, model ve kura göre değişir. Geri ödeme, sitedeki diğer araçlarla aynı modelle: yıllık %${tr(zam * 100)} elektrik zammı ve %${tr(yip * 100, 1)} panel yıpranması.</p>
            </div>

            <div class="mt-8 bg-slate-900 text-white p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <p class="font-black text-lg">Bu sistemi sahada doğrulatın</p>
                    <p class="text-slate-300 text-sm mt-1">Çatı ölçüsü, gölge ve pano durumu keşifte netleşir. Analiz özetiniz başvuru formuna otomatik eklenir.</p>
                </div>
                <button type="button" data-tu-eylem="kesif" class="bg-amber-500 hover:bg-amber-600 text-white font-black px-5 py-3 rounded-lg whitespace-nowrap">Ücretsiz keşif talebi ›</button>
            </div>`);
    }


    // --- HESAPLA VE ÇİZ ---------------------------------------------------------------------
    let _sonR = null, _olayAtildi = false, _zam = null, _raf = 0;
    function hesaplaCiz() {
        let r;
        try { r = motor.analiz(girdi()); }
        catch (err) { console.error('[tuketim-uretim]', err); r = { eksik: 'hata', u: null, t: null }; }
        _sonR = r;
        konumOzetCiz(r); tuketimOzetCiz(r); yedekOzetCiz(r); alanGorselCiz(r); cubukCiz(r); ilerlemeTazele(true);
        sonucCiz(r); gunCiz(); yontemCiz(r);
        sakla();
        if (!r.eksik && !_olayAtildi && typeof window.epcOlay === 'function') {
            _olayAtildi = true;
            window.epcOlay('tuketim_uretim_sonuc', { il: D.il, kwp: Math.round(r.kwp * 10) / 10, batarya_kwh: r.batNominal });
        }
    }
    // 0 → bir sonraki karede. Aksi hâlde kısma (throttle): sürüklerken sonuç
    // her ~180 ms'de akar; erteleme (debounce) olsaydı kullanıcı durana kadar
    // hiçbir şey değişmezdi.
    function planla(g) {
        if (g === 0) { clearTimeout(_zam); _zam = null; cancelAnimationFrame(_raf); _raf = requestAnimationFrame(hesaplaCiz); return; }
        if (_zam) return;
        _zam = setTimeout(() => { _zam = null; hesaplaCiz(); }, g == null ? 180 : g);
    }

    // --- SAYFALAR ------------------------------------------------------------------------
    const SAYFA_SAYISI = 5;
    let _ilerlemeYay = null;
    function sayfaGit(n, ilk) {
        n = Math.max(1, Math.min(SAYFA_SAYISI, Number(n) || 1));
        const once = Number(D.sayfa) || 1;
        D.sayfa = n;
        root.querySelectorAll('.tu-sayfa').forEach(s => {
            const bu = Number(s.dataset.sayfa) === n;
            s.classList.toggle('hidden', !bu);
            if (bu && !ilk) {
                // Ileri giderken sağdan, geri giderken soldan girer (yön tutarlılığı)
                s.style.setProperty('--tu-yon', (n >= once ? 16 : -16) + 'px');
                s.classList.remove('tu-sayfa-gir'); void s.offsetWidth; s.classList.add('tu-sayfa-gir');
            }
        });
        ilerlemeTazele(ilk);
        const geri = document.getElementById('tuGeri'), ileri = document.getElementById('tuIleri');
        // Gizli düğme yer KAPLAMASIN: tek düğme kalınca tam ortada dursun
        if (geri) geri.classList.toggle('hidden', n === 1);
        if (ileri) {
            ileri.classList.toggle('hidden', n === SAYFA_SAYISI);
            ileri.textContent = n === SAYFA_SAYISI - 1 ? 'Sonucu gör →' : 'İleri →';
        }
        const cubuk = document.getElementById('tuCubuk');
        if (cubuk) cubuk.classList.toggle('hidden', n === SAYFA_SAYISI);
        segZeminleri();
        if (!ilk) {
            sakla();
            const ust = document.getElementById('tuIlerleme');
            if (ust) ust.scrollIntoView({ behavior: azHareket ? 'auto' : 'smooth', block: 'start' });
            // Ekran okuyucu yeni sayfanın başlığını duysun
            document.getElementById('tuSayfa' + n + 'B')?.focus({ preventScroll: true });
        }
    }
    function ilerlemeTazele(anlik) {
        const n = Number(D.sayfa) || 1;
        const tamam = { 1: !!D.il && Number(D.faturaDeger) > 0 };
        root.querySelectorAll('[data-tu-sayfa]').forEach(b => {
            const i = Number(b.dataset.tuSayfa);
            if (i === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
            b.dataset.durum = i < n || tamam[i] ? 'gecti' : '';
            const nokta = b.querySelector('.tu-nokta2');
            if (nokta) nokta.textContent = i !== n && (i < n || tamam[i]) ? '✓' : SAYFALAR[i - 1][1];
        });
        const dolu = root.querySelector('.tu-ilerleme-dolu');
        if (!dolu) return;
        if (!_ilerlemeYay) _ilerlemeYay = Yay((n - 1) / (SAYFA_SAYISI - 1) * 100, (x) => { dolu.style.width = x.toFixed(2) + '%'; }, 0.45, 1);
        const hedef = (n - 1) / (SAYFA_SAYISI - 1) * 100;
        if (anlik) _ilerlemeYay.ayarla(hedef); else _ilerlemeYay.hedefle(hedef);
    }

    function secimleriTazele() {
        root.querySelectorAll('[data-tu-sec]').forEach(b => {
            const alan = b.dataset.tuSec;
            const acik = alan === 'evVar' ? !!D.evVar : String(D[alan]) === b.dataset.deger;
            b.setAttribute('aria-pressed', acik);
        });
        segZeminleri();
    }
    function gorunurlukTazele() {
        const g = (id, gizli) => document.getElementById(id)?.classList.toggle('hidden', gizli);
        g('tuFaturaKutu', D.tmod !== 'fatura');
        g('tuCihazKutu', D.tmod !== 'cihaz');
        g('tuDesenKutu', !!D.ayAy);
        g('tuAyAyKutu', !D.ayAy);
        g('tuYukKutu', D.hedef === 'yok');
        g('tuBataryaYokNot', D.hedef !== 'yok');
        g('tuEvKutu', !D.evVar);
        root.querySelectorAll('[data-birim-etiket]').forEach(s => { s.textContent = D.birim === 'tl' ? '₺/ay' : 'kWh/ay'; });
        root.querySelectorAll('input[data-tu="faturaDeger"]').forEach(i => { i.placeholder = D.birim === 'tl' ? 'Örn. 1500' : 'Örn. 300'; });
        segZeminleri();
    }
    function kaydirDolu(el) {
        const min = Number(el.min), max = Number(el.max);
        el.style.setProperty('--dolu', ((Number(el.value) - min) / (max - min) * 100).toFixed(1) + '%');
    }
    function evDegYaz() {
        const el = document.getElementById('tuEvDeg');
        if (el) el.textContent = tr(D.evKm) + ' km ≈ ' + tr(D.evKm * 0.18) + ' kWh';
    }
    function cedTazele() {
        const c = D.cihazlar[_cihazSecili];
        if (!c) return;
        const yil = motor.cihazYillik(c);
        const k = document.getElementById('tuCedKwh'), t = document.getElementById('tuCedTl'), a = document.getElementById('tuCedAdet');
        if (k) k.textContent = tr(yil);
        if (t) t.textContent = tl(tlYil(yil));
        if (a) a.textContent = Number(c.adet) || 0;
    }
    const cihazlarTazele = (duzenDe) => cihazKartlariCiz(duzenDe);
    const yuklerTazele = (duzenDe) => yukKartlariCiz(duzenDe);

    // --- OLAYLAR ----------------------------------------------------------------------------
    root.addEventListener('click', (e) => {
        const t = e.target;
        // Ayar (⚙) düğmeleri kartın İÇİNDE: önce onlara bak
        const cAyar = t.closest('[data-cihaz-ayar]');
        if (cAyar) {
            const i = Number(cAyar.dataset.cihazAyar);
            _cihazSecili = _cihazSecili === i ? null : i;
            cihazDuzenCiz();
            document.getElementById('tuCihazDuzen')?.scrollIntoView({ block: 'nearest', behavior: azHareket ? 'auto' : 'smooth' });
            return;
        }
        const yAyar = t.closest('[data-yuk-ayar]');
        if (yAyar) {
            const i = Number(yAyar.dataset.yukAyar);
            _yukSecili = _yukSecili === i ? null : i;
            yukDuzenCiz();
            document.getElementById('tuYukDuzen')?.scrollIntoView({ block: 'nearest', behavior: azHareket ? 'auto' : 'smooth' });
            return;
        }
        const cKart = t.closest('[data-cihaz]');
        if (cKart) {
            const i = Number(cKart.dataset.cihaz), c = D.cihazlar[i];
            c.adet = Number(c.adet) > 0 ? 0 : 1;
            cihazlarTazele(_cihazSecili === i);
            if (_cihazSecili === i) cedTazele();
            planla(0); return;
        }
        const yKart = t.closest('[data-yuk]');
        if (yKart) {
            const i = Number(yKart.dataset.yuk), y = D.yukler[i];
            y.secili = !y.secili;
            if (y.secili && !(Number(y.adet) > 0)) y.adet = 1;
            yuklerTazele(false);
            planla(0); return;
        }
        const egimHizli = t.closest('[data-tu-egim]');
        if (egimHizli) {
            const v = Number(egimHizli.dataset.tuEgim);
            if (D.yonMod === 'opt') { D.yonMod = 'tek'; D.az = 0; pusulaGoster(0, 'tek', false); secimleriTazele(); }
            D.egim = v;
            kesitGoster(v, false);
            yonOkuTazele(Number(D.az), D.yonMod);
            planla(0); return;
        }
        const ced = t.closest('[data-ced-sec]');
        if (ced) {
            const c = D.cihazlar[_cihazSecili];
            if (c) { c[ced.dataset.cedSec] = ced.dataset.deger; cihazDuzenCiz(); cihazlarTazele(false); planla(0); }
            return;
        }
        const cAdim = t.closest('[data-ced-adim]');
        if (cAdim) {
            const c = D.cihazlar[_cihazSecili];
            if (c) { c.adet = Math.max(0, (Number(c.adet) || 0) + Number(cAdim.dataset.cedAdim)); cedTazele(); cihazlarTazele(false); planla(0); }
            return;
        }
        const yAdim = t.closest('[data-yed-adim]');
        if (yAdim) {
            const y = D.yukler[_yukSecili];
            if (y) {
                y.adet = Math.max(0, (Number(y.adet) || 0) + Number(yAdim.dataset.yedAdim));
                y.secili = y.adet > 0;
                const a = document.getElementById('tuYedAdet'); if (a) a.textContent = y.adet;
                yuklerTazele(false); planla(0);
            }
            return;
        }
        const sec = t.closest('[data-tu-sec]');
        if (sec) {
            const alan = sec.dataset.tuSec, v = sec.dataset.deger;
            if (alan === 'evVar') { D.evVar = !D.evVar; evDegYaz(); }
            else if (alan === 'yonMod') {
                D.yonMod = D.yonMod === v ? 'tek' : v;        // aynı karta ikinci dokunuş pusulaya döner
                pusulaGoster(Number(D.az) || 0, D.yonMod, false);
                kesitGoster(D.yonMod === 'opt' ? (TU_IL[D.il] || TU_IL['Ankara'])[2] : Number(D.egim) || 0, false);
            } else if (alan === 'birim') {
                if (D.birim !== v && Number(D.faturaDeger) > 0) {
                    // Birim değişince değer de çevrilsin: anlam aynı kalır
                    const kwh = aylikKwh();
                    const fiyat = _sonR && _sonR.tarifeTl ? _sonR.tarifeTl : (window.epcTarife ? window.epcTarife('tariffMesken') : 5.32);
                    D.faturaDeger = v === 'kwh' ? String(Math.round(kwh)) : String(Math.round(kwh * fiyat));
                    root.querySelectorAll('input[data-tu="faturaDeger"]').forEach(i => { i.value = D.faturaDeger; });
                }
                D.birim = v;
            } else D[alan] = v;
            secimleriTazele(); gorunurlukTazele();
            planla(0); return;
        }
        const sy = t.closest('[data-tu-sayfa]');
        if (sy) { sayfaGit(Number(sy.dataset.tuSayfa)); return; }
        const b = t.closest('[data-tu-eylem]');
        if (!b) return;
        const ey = b.dataset.tuEylem;
        if (ey === 'cihazEkle') {
            D.cihazlar.push({ ikon: '🔌', ad: 'Yeni cihaz', adet: 1, w: 100, saat: 1, zaman: 'aksam', mevsim: 'tum' });
            _cihazSecili = D.cihazlar.length - 1; cihazKartlariCiz(); planla(0);
            document.querySelector('#tuCihazDuzen input[data-ced="ad"]')?.select();
        } else if (ey === 'yukEkle') {
            D.yukler.push({ ikon: '🔌', ad: 'Yeni yük', secili: true, adet: 1, w: 100, oran: 100, motor: false });
            _yukSecili = D.yukler.length - 1; yukKartlariCiz(); planla(0);
            document.querySelector('#tuYukDuzen input[data-yed="ad"]')?.select();
        } else if (ey === 'cihazSil') {
            if (_cihazSecili != null) { D.cihazlar.splice(_cihazSecili, 1); _cihazSecili = null; cihazKartlariCiz(); planla(0); }
        } else if (ey === 'yukSil') {
            if (_yukSecili != null) { D.yukler.splice(_yukSecili, 1); _yukSecili = null; yukKartlariCiz(); planla(0); }
        } else if (ey === 'duzenKapat') {
            _cihazSecili = null; _yukSecili = null; cihazDuzenCiz(); yukDuzenCiz();
        } else if (ey === 'gps') gpsBul();
        else if (ey === 'kesif') kesifAc();
        else if (ey === 'sonuca') sayfaGit(SAYFA_SAYISI);
        else if (ey === 'ileri') sayfaGit((Number(D.sayfa) || 1) + 1);
        else if (ey === 'geri') sayfaGit((Number(D.sayfa) || 1) - 1);
        else if (ey === 'sifirla') {
            if (!confirm('Tüm girdiler silinip varsayılanlara dönülsün mü?')) return;
            D = kopya(VARSAYILAN);
            try { localStorage.removeItem(SAKLA); localStorage.removeItem('epcTuGirdi.v1'); } catch (err) { }
            _cihazSecili = _yukSecili = null; _oncekiModul = 0; _oncekiPanelSayisi = 0; _oncekiSonucPanel = 0;
            Object.keys(_onceki).forEach(k => delete _onceki[k]); _canlandi.clear();
            _ilerlemeYay = null;
            iskelet(); sayfaGit(1, true); hesaplaCiz();
            root.scrollIntoView({ block: 'start' });
        }
    });
    // Kart <div role="button">: klavyeyle de açılıp kapansın
    root.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-cihaz],[data-yuk]')) { e.preventDefault(); e.target.click(); }
    });
    // Kapalı <details> içindeki bölmeli seçicinin genişliği açılınca ölçülebilir
    root.addEventListener('toggle', () => segZeminleri(), true);

    function girdiOlayi(e) {
        const el = e.target, ds = el.dataset;
        const gecikme = e.type === 'change' ? 0 : null;
        if (ds.tu) {
            const a = ds.tu;
            if (a === 'gunAy') {
                if (e.type !== 'change') return;
                D.gunAy = Number(el.value); gunCiz(); sakla();
                root.querySelector('[data-tu="gunAy"]')?.focus();
                return;
            }
            if (a === 'egim') {
                const v = Number(el.value);
                if (D.yonMod === 'opt') { D.yonMod = 'tek'; D.az = 0; pusulaGoster(0, 'tek', false); secimleriTazele(); }
                D.egim = v;
                kesitGoster(v, true);                     // kaydırıcı: 1:1, gecikmesiz
                yonOkuTazele(Number(D.az), D.yonMod);
                planla(gecikme); return;
            }
            if (a === 'alan') { D.alan = Number(el.value); kaydirDolu(el); alanGorselCiz(_sonR); planla(gecikme); return; }
            if (a === 'saat') {
                D.saat = Number(el.value); kaydirDolu(el);
                const s = document.getElementById('tuSaatDeg'); if (s) s.textContent = D.saat + ' saat';
                planla(gecikme); return;
            }
            if (a === 'evKm') { D.evKm = Number(el.value); kaydirDolu(el); evDegYaz(); planla(gecikme); return; }
            if (a === 'yedOran') {
                const y = D.yukler[_yukSecili];
                if (y) { y.oran = Number(el.value); kaydirDolu(el); const o = document.getElementById('tuYedOran'); if (o) o.textContent = '%' + y.oran; planla(gecikme); }
                return;
            }
            D[a] = el.type === 'checkbox' ? el.checked : el.value;
            if (a === 'faturaDeger' || a === 'il') root.querySelectorAll(`[data-tu="${a}"]`).forEach(x => { if (x !== el) x.value = el.value; });
            if (a === 'il') {
                D.gpsLat = null; D.gpsLon = null;
                const d = document.getElementById('tuGpsDurum'); if (d) d.textContent = '';
                kesitGoster(D.yonMod === 'opt' ? (TU_IL[D.il] || TU_IL['Ankara'])[2] : Number(D.egim) || 0, false);
                yonOkuTazele(Number(D.az), D.yonMod);
            }
            if (a === 'ayAy') gorunurlukTazele();
            planla(gecikme); return;
        }
        if (ds.tuAy != null) { D.aylar[Number(ds.tuAy)] = el.value; planla(gecikme); return; }
        if (ds.ced) {
            const c = D.cihazlar[_cihazSecili];
            if (!c) return;
            c[ds.ced] = el.value;
            cedTazele(); cihazlarTazele(false); planla(gecikme); return;
        }
        if (ds.yed) {
            const y = D.yukler[_yukSecili];
            if (!y) return;
            if (ds.yed === 'motor') y.motor = el.checked;
            else if (ds.yed === 'ad') y.ad = el.value;
            else y[ds.yed] = Number(el.value) || 0;
            yuklerTazele(false); planla(gecikme); return;
        }
        if (ds.tuKayip) {
            if (el.value === '') delete D.kayiplar[ds.tuKayip];
            else D.kayiplar[ds.tuKayip] = Math.max(0, Math.min(30, Number(el.value) || 0));
            planla(gecikme); return;
        }
    }
    root.addEventListener('input', girdiOlayi);
    root.addEventListener('change', girdiOlayi);
    function yontemCiz(r) {
        const S = window.EPC_SETTINGS || {};
        yaz('tuYontem', `
            <p class="font-black text-slate-700 text-sm">Hesap yöntemi</p>
            <p><b>Üretim:</b> PVGIS v5.2 (AB Ortak Araştırma Merkezi) SARAH2 uydu verisi, 2005–2020 ortalaması, il sınır merkezi. Çatı yönü ve eğimi için Antalya, Ankara ve Samsun'da çekilen aylık eğim×yön ızgarasının ortalaması kullanılır (yaygın yönlerde iller arası fark %1–3).</p>
            <p><b>Saatlik dağılım:</b> her ayın temsili gününde güneşin konumu (Türkiye saati UTC+3, zaman denklemi dahil) ve panelin yönüne göre açık gökyüzü ışınımı; bulutluluk için %35 dağınık ışınım payı. Günlük enerji PVGIS'ten gelir, saat dağılımı bu modelden.</p>
            <p><b>Tüketim:</b> ${D.tmod === 'cihaz' ? 'cihaz listenizdeki güç × süre, seçtiğiniz zaman dilimine eşit yayılarak' : 'faturanızdaki tüketim; gün içi dağılım seçtiğiniz yaşam düzenine göre tipik profilden (tabandaki sürekli yük + sabah/gündüz/akşam/gece payları)'}.</p>
            <p><b>Simülasyon:</b> 12 tipik gün × 24 saat. Üretim önce eve, artan bataryaya, kalan şebekeye gider. Tipik gün ortalama hava demektir: art arda bulutlu günler hesaba girmez, bu yüzden gerçek bağımsızlık oranı birkaç puan düşük olabilir.</p>
            <p><b>Optimum boy:</b> yıllık üretim = yıllık tüketim (aylık mahsuplaşmada faturayı en çok düşüren boy); çatı alanı ve sözleşme gücü sınırları uygulanır. Panel gücü ${tr((Number(S.kwpPerPanel) || 0.55) * 1000)} W, kWp başı çatı ${sade(Number(S.roofM2PerKwp) || 5.5, 1)} m², inverter DC/AC ≈ 1,15.</p>
            <p><b>Batarya:</b> kapasite = enerji ÷ deşarj derinliği (%${tr((Number(S.batteryDod) || 0.9) * 100)}) ÷ inverter verimi (%${tr((Number(S.inverterEff) || 0.95) * 100)}), ${sade(Number(S.batteryModule) || 5)} kWh modüle yuvarlanır. “Yalnız yedekleme”de batarya dolu bekler; “bağımsızlık”ta günlük döngü yapar ama kesinti için gereken enerji saklı tutulur.</p>
            <p><b>Tarife ve satış:</b> EPDK 4 Nisan 2026 tarifesi (vergiler dahil). Mahsuplaşmayan fazla enerji, abone grubunuzun aktif enerji bedeli (vergisiz) üzerinden değerlendirilir varsayıldı. Mevzuat ve tarifeler değişebilir.</p>
            <p>Sonuçlar ön boyutlandırma içindir; kesin proje saha keşfi ve dağıtım şirketi onayıyla belirlenir.</p>`);
    }

    // --- KONUM (GPS) ------------------------------------------------------------------------
    // Yalnız en yakın il verisini seçmek ve saatlik güneş profilini tam
    // konuma göre çizmek için. Koordinat ~1 km'ye yuvarlanıp yalnız bu
    // tarayıcıda tutulur; hiçbir yere gönderilmez.
    function gpsBul() {
        const durum = (m) => { const s = document.getElementById('tuGpsDurum'); if (s) s.textContent = m; };
        if (!navigator.geolocation) { durum('Tarayıcınız konum paylaşımını desteklemiyor.'); return; }
        durum('Konum alınıyor…');
        navigator.geolocation.getCurrentPosition((p) => {
            const la = p.coords.latitude, lo = p.coords.longitude, R = Math.PI / 180;
            let enIyi = null, enKisa = Infinity;
            Object.keys(TU_IL).forEach(il => {
                const [a, b] = TU_IL[il];
                const d = 6371 * Math.acos(Math.min(1, Math.sin(la * R) * Math.sin(a * R) + Math.cos(la * R) * Math.cos(a * R) * Math.cos((lo - b) * R)));
                if (d < enKisa) { enKisa = d; enIyi = il; }
            });
            if (!enIyi || enKisa > 300) { durum('Konumunuz Türkiye dışında görünüyor; ilinizi listeden seçin.'); return; }
            D.il = enIyi; D.gpsLat = Math.round(la * 100) / 100; D.gpsLon = Math.round(lo * 100) / 100;
            const sel = root.querySelector('[data-tu="il"]'); if (sel) sel.value = enIyi;
            kesitGoster(D.yonMod === 'opt' ? TU_IL[enIyi][2] : Number(D.egim) || 0, false);
            durum('En yakın il verisi: ' + enIyi + '. Farklıysa listeden düzeltin.');
            planla(0);
        }, (err) => durum(err && err.code === 1 ? 'Konum izni verilmedi; ilinizi listeden seçin.' : 'Konum alınamadı; ilinizi listeden seçin.'),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    }

    // --- KEŞİF FORMUNA AKTARIM ----------------------------------------------------------------
    function ozetMetni(r) {
        const cati = D.yonMod === 'opt' ? 'düz çatı / sehpa (en iyi açı)' : D.yonMod === 'db' ? `doğu + batı, ${Math.round(D.egim)}°` : `${yonAdi(Number(D.az))} (${Math.round(D.az)}°), ${Math.round(D.egim)}° eğim`;
        const L = ['[Tüketim & Üretim Analizi]',
            `Konum: ${D.il} · Çatı: ${cati} · Gölgelenme: ${{ yok: 'yok', az: 'az', orta: 'orta', fazla: 'fazla' }[D.golge] || D.golge}`,
            `Yıllık tüketim: ${tr(r.t.yillik)} kWh (${{ fatura: 'faturadan', cihaz: 'cihaz listesinden', 'cihaz+fatura': 'fatura toplamı + cihaz listesi' }[r.t.kaynak] || ''})${r.t.evYillik > 0 ? ' — elektrikli araç dahil' : ''}`,
            `Önerilen: ${sade(r.kwp)} kWp (${r.panel} × ${tr(r.panelKwp * 1000)} W), ${sade(r.invAc)} kW ${r.hibrit ? 'hibrit' : 'on-grid'} inverter${r.batModul > 0 ? `, ${sade(r.batNominal)} kWh batarya` : ''}`,
            `Tahmini yıllık üretim: ${tr(r.ana.uretim)} kWh · karşılama ${yz(r.ana.karsilama)}`];
        if (r.batModul > 0 && r.yd.secili.length) L.push(`Kesinti yükleri (${r.yd.sure} saat): ${r.yd.secili.map(x => x.ad).join(', ')}`);
        if (Number(D.alan) > 0) L.push(`Kullanılabilir çatı: ${tr(D.alan)} m²`);
        return L.join('\n');
    }
    function kesifAc() {
        if (typeof window.openLeadModal !== 'function') return;
        window.openLeadModal('kurulum');
        const r = _sonR;
        if (!r || r.eksik) return;
        const koy = (id, v) => { const el = document.getElementById(id); if (el && v && !el.value) el.value = v; };
        koy('leadCity', D.il);
        const kes = document.getElementById('leadOutage'); if (kes) kes.value = r.batModul > 0 ? 'Evet' : 'Hayır';
        if (D.evVar && Number(D.evKm) > 0) koy('leadExtraConsumption', 'Elektrikli araç ~' + tr(D.evKm) + ' km/yıl');
        koy('leadDetails', ozetMetni(r));
    }


    // --- BAŞLAT -------------------------------------------------------------------------------
    iskelet();
    sayfaGit(D.sayfa, true);
    evDegYaz();
    hesaplaCiz();
    // Yönetici ayarları (tarife, kur, panel gücü…) sayfa açıldıktan sonra
    // geliyor; gelince ve sonradan değişince sonuç kendini tazeler.
    if (typeof window.epcAyarlarHazir === 'function') window.epcAyarlarHazir(() => hesaplaCiz());
})();
