# PIU / RO-district name -> geoBoundaries ADM2 shapeName
ALIAS = {
 # spelling / renaming
 'AMRAVATI':'Amravati','Amravati (MH)':'Amravati','Amravati (AP)':'Guntur','Amaravati (AP)':'Guntur',
 'Ahilyanagar':'Ahmadnagar','Ahmednagar / Ahilyanagar':'Ahmadnagar','Ahmedabad':'Ahmadabad',
 'Ayodhya':'Faizabad','Bengaluru':'Bangalore','Bhatinda':'Bathinda','Bhiwani (HR)':'Bhiwani',
 'Bhiwani-CHD-HR':'Bhiwani','Bhubaneshwar':'Khordha','Bhubaneswar':'Khordha','Berhampur':'Ganjam',
 'Chengalpattu':'Kancheepuram','Kanchipuram':'Kancheepuram','Chhatrapati Sambhajinagar':'Aurangabad',
 'Chhattarpur':'Chhatarpur','Chittor':'Chittoor','Cochin':'Ernakulam','Cochin-II':'Ernakulam',
 'Daltonganj':'Palamu','Daltonganj (JH)':'Palamu','Hazaribagh (JH)':'Hazaribagh',
 'Aurangabad (BR)':'Aurangabad','Hissar':'Hisar','Hospet':'Bellary','Kalaburagi':'Gulbarga',
 'Kanpur':'Kanpur Nagar','Mysuru':'Mysore','Tumakuru':'Tumkur','Vijayapura':'Bijapur',
 'Prayagraj':'Allahabad','Prayagraj (WB)':'Allahabad','Raebareli':'Rae Bareli','Raibareli':'Rae Bareli',
 'PURNEA':'Purnia','Purulia':'Puruliya','Roorkee':'Hardwar','Sonepat':'Sonipat','Sonipat-CHD-HR':'Sonipat',
 'Trichy':'Tiruchirappalli','Tuticorin':'Thoothukkudi','Nagarcoil':'Kanniyakumari','Nagercoil':'Kanniyakumari',
 'Nabarangpur':'Nabarangapur','Navrangpur':'Nabarangapur','Rajamahendravaram':'East Godavari',
 'Vizianagram':'Vizianagaram','Krishnagar':'Nadia','Malda':'Maldah','Motihari':'Purba Champaran',
 'Chhapra':'Saran','Sasaram':'Rohtas','Palampur':'Kangra','Palanpur':'Banas Kantha','Godhra':'Panch Mahals',
 'Vadodara (Earlier Godhra)':'Vadodara','Najibabad':'Bijnor','Rudrapur':'Udham Singh Nagar',
 'Mangalore':'Dakshina Kannada','Honnavar':'Uttara Kannada','Karaikudi':'Sivaganga','Khandwa':'Khandwa (East Nimar)',
 'Keonjhar':'Kendujhar','Pandharpur':'Solapur','Panvel':'Raigarh','Nellore':'Sri Potti Sriramulu Nellore',
 'Ongole':'Prakasam','Kadapa':'Kadapa(YSR)','Tirupati':'Chittoor','Vijayawada':'Krishna','Warangal':'Warangal (U)',
 'Gajwel':'Medak','Khammam-I':'Khammam','Hyderabad':'Rangareddy','Chennai-II':'Chennai','Khammam-II':'Khammam','Khammam-I':'Khammam','Guwahati':'Kamrup','Silchar':'Cachar',
 'Shillong':'East Khasi Hills','Durgapur':'Barddhaman','Kharagpur':'Paschim Medinipur',
 # town -> district
 'Chandikhol':'Cuttack','Chandikhole':'Cuttack','Sohna':'Gurgaon','Dwarka':'South West',
 'Vasant Vihar':'South West','VasantViharDehradun':'Dehradun','Gandhidham':'Kachchh',
 'Ekta Nagar':'Narmada','Ektanagar':'Narmada','Abhanpur':'Raipur','Dhamtari/Abhanpur':'Raipur',
 'Goa':'North Goa','CSN':'Chennai','Ludhiana (Expressway)':'Ludhiana',
 'Nagpur (PD-1)':'Nagpur','Nagpur (PD-2)':'Nagpur',
 # RO-district table extras
 'Amroha':'Jyotiba Phule Nagar','Barabanki':'Bara Banki','Beed':'Bid','Bhadohi':'Sant Ravidas Nagar (Bhadohi)',
 'Buldhana':'Buldana','Dharashiv':'Osmanabad','Gondia':'Gondiya','Hathras':'Mahamaya Nagar',
 'Kasganj':'Kanshiram Nagar','Lakhimpur Kheri':'Kheri','Maharajganj':'Mahrajganj',
 'Mumbai City':'Mumbai','Nilgiris':'The Nilgiris','Raigad':'Raigarh','Shamli':'Muzaffarnagar',
 'Tiruvallur':'Thiruvallur','Kanpur ':'Kanpur Nagar',
}
import re
def clean(s):
    s = re.sub(r'\s*-\s*\d+$','',s.strip())
    s = re.sub(r'\s*-\s*(CHD|DL|HR|PB|UP|MH|RJ)$','',s,flags=re.I)
    s = re.sub(r'^(CMU|PIU)\s+','',s,flags=re.I)
    return s.strip()
def resolve(name, districts):
    if not name: return None
    for cand in (name, clean(name), ALIAS.get(name), ALIAS.get(clean(name))):
        if cand and cand in districts: return cand
    c=clean(name).lower()
    for d in districts:
        if d.lower()==c: return d
    return None
