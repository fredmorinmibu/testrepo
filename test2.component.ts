import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, throwError as observableThrowError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ApiCall } from '../models/apicalls';
import { IAppointment } from '../models/appointment';
import { PostData } from '../models/postdata/PostData';
import { IdbService } from './idb.service';
import { SyncService } from './sync.service';
import { OfflineService } from './offline.service';
import { OfflinePostData } from '../models/offline';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Questionnaire } from '../models/questionnaire';
import { IWebWorkOrdersResult } from '../models/web-work-orders-result';
import { LocalStorageService } from './local-storage.service';
import { TranslationService } from './translation.service';

const httpOptions = {
    headers: new HttpHeaders({
        C: 'application/json',
        'Access-Control-Allow-Origin': '*',
    }),
};

@Injectable()
export class DbService {
    getItemList: any;
    setTime: any;
    updateTime: any;
    demo = false;
    autoPosting = false;
    // private readonly QuestionsStoreName: string = 'questions';
    public readonly storeNamePostData: string = 'user-store';
    public readonly offlineCompleted: string = 'offline-completed';
    offlinePostDatas: any;
    refreshTime = 15;
    timeLeft = this.refreshTime; // every 5 seconds we check for autopost this is the only place where we call it
    interval = 0;
    working = false;
    stopped = false;
    private readonly appointmentStoreName: string = 'appointments';
    private readonly currentWorkOrdersStoreName: string = 'current-workorders';
    private readonly dictionaryStoreName: string = 'dictionnaries';
    private readonly emailJobQueueStoreName: string = 'email-job-queue';
    private readonly openAppointmentStoreName: string = 'open-appointment';
    private readonly paymentMethodsStoreName: string = 'payment_methods';
    private readonly previewAppointmentStoreName: string =
        'preview-appointment';
    private readonly readyToSendStoreName: string = 'ready-to-send';
    private readonly vetProfTimeStoreName: string = 'vet_prof_time';
    private readonly treatmentStoreName: string = 'treatment';
    private readonly addProcServiceStoreName: string =
        'additional_processing_service';
    private readonly addVetServiceStoreName: string =
        'additional_veterinary_service';
    private readonly DrugsDispensedStoreName: string = 'drugs_dispensed';
    private readonly DrugsUsedInTreatmentStoreName: string =
        'drugs_used_in_treatment';
    private readonly FutureWOStoreName: string = 'future-wo';
    private readonly OfflineEntriesStoreName: string = 'offline-entries';

    constructor(
        private http: HttpClient,
        private idb: IdbService,
        private ts: TranslationService,
        private sync: SyncService,
        private snackBar: MatSnackBar,
        private ngxIndexedDBService: NgxIndexedDBService,
        private offlineService: OfflineService,
        private localStorageService: LocalStorageService
    ) {
        this.startTimer();
    }

    public getLastUpdate() {
        return localStorage.getItem('last_update');
    }

    public getForceRefresh() {
        const data = localStorage.getItem('force-refresh');
        if (data === '') {
            return false;
        } else {
            return data === 'true';
        }
    }

    async stopTimer() {
        this.stopped = true;
        console.log('stop db timer');
    }

    async startTimer() {
        // console.log('Start Autopost Monitoring');

        this.interval = setInterval(() => {
            if (this.working || this.stopped) {
                console.log('working');
                return;
            }

            if (this.timeLeft > 0) {
                //console.log(this.timeLeft);
                this.timeLeft--;
            } else {
                this.working = true;
                this.timeLeft = this.refreshTime;
                if (navigator.onLine) {
                    console.log('we are online');

                    this.offlineService.getOfflinePostDatas().subscribe((r) => {
                        this.offlinePostDatas = r;
                        if (this.offlinePostDatas.length > 0) {
                            console.log(
                                `we have ${this.offlinePostDatas.length} posts to handle`
                            );

                            this.offlinePostDatas.forEach(async (p) => {
                                console.log(
                                    `we are handling ${p.value.url}`,
                                    p.value.url,
                                    p.value.data,
                                    p
                                );

                                await this.delay(1000);

                                console.log(
                                    'posting',
                                    p.value.url,
                                    p.value.data
                                );
                                console.log(
                                    'stringify',
                                    p.value.url,
                                    JSON.stringify(p.value.data)
                                );

                                /*  if (!p.value.data.company) {
                    console.log(
                        'dont know why this company is empty',
                        p.value.data
                    );
                    const errors = localStorage.getItem(
                        'errors'
                    );

                    const list = new Array<OfflinePostData>();
                    if (!!errors) {
                        list.push(JSON.parse(errors));
                    }
                    list.push(p.value.data);
                    localStorage.setItem(
                        'errors',
                        JSON.stringify(list)
                    );

                    console.log(`list so far`, list);
                }*/

                                console.log('we post here and wait 1 second');

                                await this.delay(1000);

                                console.log('done waiting');

                                this.post(p.value.url, p.value.data).subscribe(
                                    (pr) => {
                                        console.log('post rsult is', pr);
                                        if (!this.weHaveError(pr)) {
                                            this.updateCurrentAppoitment(
                                                p.value.data
                                            );

                                            this.ngxIndexedDBService
                                                .delete(
                                                    this.storeNamePostData,
                                                    p.key
                                                )
                                                .subscribe((deleteResult) => {
                                                    console.log(
                                                        'delete result for',
                                                        p,
                                                        p.key,
                                                        deleteResult
                                                    );
                                                    this.localStorageService.decreaseCount();
                                                });
                                        } else {
                                            console.log(`error posting`, pr);
                                        }
                                    }
                                );
                            });
                        } else {
                            if (!environment.production) {
                                this.localStorageService.setCount(0);
                                //console.log(`we dont have any posts to handle`);
                            }
                        }
                        this.working = false;
                    });
                } else {
                    console.log('we are offline nothing to do');
                }
            }
        }, 1000);
    }

    weHaveError(pr: any): boolean {
        if (pr.success === false) {
            console.log('pr.success', pr.success);
            return true;
        }
        if (!!pr.error) {
            console.log('pr.error', pr.error);
            return true;
        }
        if (pr.HandleSimpleInteger?.Data?.error) {
            console.log(
                'pr.HandleSimpleInteger.error',
                pr.HandleSimpleInteger.Data.error
            );
            return true;
        }
        if (pr.HandleSimpleDecimal?.Data?.error) {
            console.log(
                'pr.HandleSimpleDecimal.error',
                pr.HandleSimpleDecimal.Data.error
            );
            return true;
        }
        if (pr.HandleSimpleText?.Data?.error) {
            console.log(
                'pr.HandleSimpleText.error',
                pr.HandleSimpleText.Data.error
            );
            return true;
        }
        console.log('no errors', pr);

        return false;
    }

    public setLastUpdate(value) {
        return localStorage.setItem('last_update', value);
    }

    public taskDate(dateMilli) {
        const d = (new Date(dateMilli) + '').split(' ');
        d[2] = d[2] + ',';
        return [d[0], d[1], d[2], d[3]].join(' ');
    }

    public getFetchSize() {
        return isNaN(parseInt(localStorage.getItem('fetchSize'), 10))
            ? 250
            : parseInt(localStorage.getItem('fetchSize'), 10);
    }

    public getCODMethod() {
        return localStorage.getItem('payment_method_cod');
    }

    public getMaxAnimals(): number {
        const maxAnimals = localStorage.getItem('max_animals');
        if (!maxAnimals || maxAnimals === `0`) {
            this.setMaxAnimals(3);
            return 3;
        }
        return parseInt(maxAnimals, 10);
    }

    public setCODMethod(value) {
        return localStorage.setItem('payment_method_cod', value);
    }

    public setFetchSize(value) {
        localStorage.setItem('fetchSize', value);
    }

    public getUsername() {
        // return 'DVUKMANICH';
        return localStorage.getItem('username');
    }

    public getAppointments(callback) {
        this.ngxIndexedDBService
            .getAll(this.appointmentStoreName)
            .subscribe((respStatus) => {
                callback(respStatus);
            });
    }

    public setAppointments(appointment) {
        this.ngxIndexedDBService
            .clear(this.appointmentStoreName)
            .subscribe((resp) => {
                if (appointment.length > 0) {
                    const last = appointment[appointment.length - 1];
                    // tslint:disable-next-line:prefer-for-of
                    for (let i = 0; i < appointment.length; i++) {
                        this.ngxIndexedDBService
                            .add(this.appointmentStoreName, appointment[i])
                            .subscribe(
                                (result) => {
                                    if (
                                        result[0] === last.Key &&
                                        result[1] === last.Document_Type
                                    ) {
                                    }
                                },
                                (error) => {}
                            );
                    }
                } else {
                }
            });
    }

    public setOpenAppointment(appointment, redirect, error) {
        if (!appointment) {
            redirect();
            return;
        }

        this.ngxIndexedDBService.clear('open-appointment').subscribe((rep) => {
            this.ngxIndexedDBService
                .add('open-appointment', appointment)
                .subscribe(
                    (respStatus) => {
                        redirect();
                    },
                    (err) => {
                        error(err);
                    }
                );
        });
    }

    public updateAppointement(appointment, redirect) {
        this.ngxIndexedDBService
            .update(this.appointmentStoreName, appointment)
            .subscribe(
                (rep) => {
                    redirect();
                },
                (error) => {
                    if (!environment.production) {
                        console.log('error', error);
                    }
                }
            );
    }

    public setPreviewAppointment(appointment, redirect) {
        if (!appointment) {
            redirect();
            return;
        }

        this.ngxIndexedDBService
            .clear('preview-appointment')
            .subscribe((rep) => {
                if (!environment.production) {
                    console.log('clear preview app');
                }

                this.ngxIndexedDBService
                    .add('preview-appointment', appointment)
                    .subscribe(
                        (respStatus) => {
                            if (!environment.production) {
                                console.log(
                                    'added preview appointment',
                                    appointment
                                );
                                console.log(`response status is ${respStatus}`);
                            }

                            redirect();
                        },
                        (err) => {
                            if (!environment.production) {
                                console.log('error', err);
                            }
                        }
                    );
            });
    }

    public clearOpenAppointment(callback) {
        this.ngxIndexedDBService.clear('open-appointment').subscribe(
            (resp) => {
                callback(resp);
            },
            (exception) => callback(exception)
        );
    }

    public clearPreviewAppointment(callback) {
        this.ngxIndexedDBService.clear('preview-appointment').subscribe(
            (resp) => {
                callback(resp);
            },
            (error) => callback(error)
        );
    }

    /*   public setDictionnaries(dictionnaries) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear('dictionnaries')
                .subscribe((resp) => {
                    if (dictionnaries.length > 0) {
                        const last = dictionnaries[dictionnaries.length - 1];
                        // tslint:disable-next-line:prefer-for-of
                        for (let i = 0; i < dictionnaries.length; i++) {
                            const key = dictionnaries[i].Key;
                            this.ngxIndexedDBService
                                .add('dictionnaries', dictionnaries[i])
                                .subscribe(
                                    (result) => {
                                        /!*console.log(`result`, result);*!/
                                    },
                                    (error) => {
                                        if (!environment.production) {
                                            console.log(`erreur`, error);
                                        }
                                    }
                                );
                        }
                    }
                });
        }
    }
*/

    public setDictionnaries(dictionnaries) {
        if (navigator.onLine) {
            const selectLanguage =
                localStorage.getItem('selectLanguage') || 'en';
            console.log('set Dictionnaries for selectLanguage', selectLanguage);

            const storeName =
                selectLanguage === 'en' ? 'dictionnaries' : 'dictionnaries_fr';

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (dictionnaries.length > 0) {
                    dictionnaries.forEach((dictionary) => {
                        const key = dictionary.Key;
                        this.ngxIndexedDBService
                            .add(storeName, dictionary)
                            .subscribe(
                                (result) => {
                                    /*console.log(`result`, result);*/
                                },
                                (error) => {
                                    if (!environment.production) {
                                        console.log(`error`, error);
                                    }
                                }
                            );
                    });
                }
            });
        }
    }

    public getDictionnaries(callback) {
        const selectLanguage = localStorage.getItem('selectLanguage') || 'en';
        console.log('get Dictionnaries for selectLanguage', selectLanguage);

        const storeName =
            selectLanguage === 'en' ? 'dictionnaries' : 'dictionnaries_fr';

        this.ngxIndexedDBService.getAll(storeName).subscribe((respStatus) => {
            callback(respStatus);
        });
    }

    public setPaymentMethods(paymentMethod) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear('payment_methods')
                .subscribe((resp) => {
                    this.ngxIndexedDBService
                        .add('payment_methods', paymentMethod)
                        .subscribe(
                            (resp2) => {
                                if (!environment.production) {
                                    console.log(resp2);
                                }
                            },
                            (error) => {
                                if (!environment.production) {
                                    console.log('error ' + error);
                                }
                            }
                        );
                });
        }
    }
    public setAdditionalProcessingService(addProcServices) {
        if (navigator.onLine) {
            const selectLanguage =
                localStorage.getItem('selectLanguage') || 'en';
            console.log(
                'set AdditionalProcessingService for selectLanguage',
                selectLanguage
            );

            const storeNames = {
                en: this.addProcServiceStoreName,
                fr: this.addProcServiceStoreName + '_fr',
            };

            const storeName = storeNames[selectLanguage];

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (addProcServices.length > 0) {
                    addProcServices.forEach((service) => {
                        const key = service.Key;
                        this.ngxIndexedDBService
                            .add(storeName, service)
                            .subscribe(
                                (result) => {},
                                (error) => {
                                    if (!environment.production) {
                                        console.log('error', error);
                                    }
                                }
                            );
                    });
                }
            });
        }
    }

    /* public setAdditionalProcessingService(addProcServices) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear(this.addProcServiceStoreName)
                .subscribe((resp) => {
                    if (addProcServices.length > 0) {
                        const last =
                            addProcServices[addProcServices.length - 1];
                        // tslint:disable-next-line:prefer-for-of
                        for (let i = 0; i < addProcServices.length; i++) {
                            const key = addProcServices[i].Key;
                            this.ngxIndexedDBService
                                .add(
                                    this.addProcServiceStoreName,
                                    addProcServices[i]
                                )
                                .subscribe(
                                    (result) => {},
                                    (error) => {
                                        if (!environment.production) {
                                            console.log('error ' + error);
                                        }
                                    }
                                );
                        }
                    } else {
                    }
                });
        }
    }*/
    public setVetProfTime(vetProfTimes) {
        if (navigator.onLine) {
            const selectLanguage =
                localStorage.getItem('selectLanguage') || 'en';
            console.log('set VetProfTime for selectLanguage', selectLanguage);

            const storeNames = {
                en: this.vetProfTimeStoreName,
                fr: this.vetProfTimeStoreName + '_fr',
            };

            const storeName = storeNames[selectLanguage];

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (vetProfTimes.length > 0) {
                    vetProfTimes.forEach((vetProfTime) => {
                        const key = vetProfTime.Key;
                        this.ngxIndexedDBService
                            .add(storeName, vetProfTime)
                            .subscribe(
                                (result) => {},
                                (error) => {
                                    if (!environment.production) {
                                        console.log('error', error);
                                    }
                                }
                            );
                    });
                }
            });
        }
    }

    /* public setVetProfTime(vetProfTimes) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear(this.vetProfTimeStoreName)
                .subscribe((resp) => {
                    if (vetProfTimes.length > 0) {
                        const last = vetProfTimes[vetProfTimes.length - 1];
                        // tslint:disable-next-line:prefer-for-of
                        for (let i = 0; i < vetProfTimes.length; i++) {
                            const key = vetProfTimes[i].Key;

                            this.ngxIndexedDBService
                                .add(this.vetProfTimeStoreName, vetProfTimes[i])
                                .subscribe(
                                    (result) => {},
                                    (error) => {
                                        if (!environment.production) {
                                            console.log('error ' + error);
                                        }
                                    }
                                );
                        }
                    } else {
                    }
                });
        }
    }
*/
    public setAddVetServices(addVetServices) {
        if (navigator.onLine) {
            let language = localStorage.getItem('targetLanguage') || 'en';
            console.log('set AddVetServices for language', language);

            const storeName =
                language === 'en'
                    ? this.addVetServiceStoreName
                    : this.addVetServiceStoreName + '_fr';

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (addVetServices.length > 0) {
                    addVetServices.forEach((service) => {
                        const key = service.Key;
                        if (language !== 'en') {
                            console.log('adding', service);
                            service.Description = this.ts.getTranslation(
                                service.Description
                            );
                        }
                        this.ngxIndexedDBService
                            .add(storeName, service)
                            .subscribe(
                                (result) => {},
                                (error) => {
                                    if (!environment.production) {
                                        console.log('error', error);
                                    }
                                }
                            );
                    });
                } else {
                    console.log('no add vet services');
                }
            });
        }
    }

    public setDrugsUsed(drugsUsed) {
        if (navigator.onLine) {
            const selectLanguage =
                localStorage.getItem('selectLanguage') || 'en';
            console.log('set DrugsUsed for selectLanguage', selectLanguage);

            const storeNames = {
                en: this.DrugsUsedInTreatmentStoreName,
                fr: this.DrugsUsedInTreatmentStoreName + '_fr',
            };

            const storeName = storeNames[selectLanguage];

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (drugsUsed.length > 0) {
                    drugsUsed.forEach((drug) => {
                        const key = drug.Key;
                        this.ngxIndexedDBService.add(storeName, drug).subscribe(
                            (result) => {},
                            (error) => {
                                console.log('error', error);
                            }
                        );
                    });
                }
            });
        }
    }

    public setFutureWO(futureWO) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear(this.FutureWOStoreName)
                .subscribe((resp) => {
                    if (futureWO.length > 0) {
                        const last = futureWO[futureWO.length - 1];
                        // tslint:disable-next-line:prefer-for-of
                        for (let i = 0; i < futureWO.length; i++) {
                            const key = futureWO[i].Key;
                            this.ngxIndexedDBService
                                .add(this.FutureWOStoreName, futureWO[i])
                                .subscribe(
                                    (result) => {},
                                    (error) => {
                                        console.log('error ' + error);
                                    }
                                );
                        }
                    } else {
                    }
                });
        }
    }

    /* public setDrugsDispensed(drugsDispensed) {
        if (navigator.onLine) {
            this.ngxIndexedDBService
                .clear(this.DrugsDispensedStoreName)
                .subscribe((resp) => {
                    if (drugsDispensed.length > 0) {
                        const last = drugsDispensed[drugsDispensed.length - 1];
                        // tslint:disable-next-line:prefer-for-of
                        for (let i = 0; i < drugsDispensed.length; i++) {
                            const key = drugsDispensed[i].Key;
                            this.ngxIndexedDBService
                                .add(
                                    this.DrugsDispensedStoreName,
                                    drugsDispensed[i]
                                )
                                .subscribe(
                                    (result) => {
                                        // console.log(result);
                                    },
                                    (error) => {
                                        console.log('error ' + error);
                                    }
                                );
                        }
                    } else {
                    }
                });
        }
    }*/

    public setDrugsDispensed(drugsDispensed) {
        if (navigator.onLine) {
            const selectLanguage =
                localStorage.getItem('selectLanguage') || 'en';
            console.log(
                'set DrugsDispensed for selectLanguage',
                selectLanguage
            );

            const storeName =
                selectLanguage === 'en'
                    ? this.DrugsDispensedStoreName
                    : this.DrugsDispensedStoreName + '_fr';

            this.ngxIndexedDBService.clear(storeName).subscribe(() => {
                if (drugsDispensed.length > 0) {
                    drugsDispensed.forEach((drug) => {
                        const key = drug.Key;
                        this.ngxIndexedDBService.add(storeName, drug).subscribe(
                            (result) => {
                                // console.log(result);
                            },
                            (error) => {
                                console.log('error', error);
                            }
                        );
                    });
                }
            });
        }
    }

    /*  public getVetProfTime(callback) {
        this.ngxIndexedDBService
            .getAll(this.vetProfTimeStoreName)
            .subscribe((resp) => {
                callback(resp);
            });
    }*/
    public getVetProfTime(callback) {
        const selectLanguage = localStorage.getItem('selectLanguage') || 'en';
        console.log('get VetProfTime for selectLanguage', selectLanguage);

        const storeName =
            selectLanguage === 'en'
                ? this.vetProfTimeStoreName
                : this.vetProfTimeStoreName + '_fr';

        this.ngxIndexedDBService.getAll(storeName).subscribe((resp) => {
            callback(resp);
        });
    }

    /*
  public getDrugsUsed(callback) {
        this.ngxIndexedDBService
            .getAll(this.DrugsUsedInTreatmentStoreName)
            .subscribe((resp) => {
                callback(resp);
            });
    }*/
    public getDrugsUsed(callback) {
        const selectLanguage = localStorage.getItem('selectLanguage') || 'en';
        console.log('get DrugsUsed for selectLanguage', selectLanguage);

        const storeName =
            selectLanguage === 'en'
                ? this.DrugsUsedInTreatmentStoreName
                : this.DrugsUsedInTreatmentStoreName + '_fr';

        this.ngxIndexedDBService.getAll(storeName).subscribe((resp) => {
            callback(resp);
        });
    }

    public getFutureWOs(callback) {
        this.ngxIndexedDBService
            .getAll(this.FutureWOStoreName)
            .subscribe((resp) => {
                callback(resp);
            });
    }

    /*  public getDrugsDispensed(callback) {
        this.ngxIndexedDBService
            .getAll(this.DrugsDispensedStoreName)
            .subscribe((resp) => {
                callback(resp);
            });
    }*/

    public getDrugsDispensed(callback) {
        const selectLanguage = localStorage.getItem('selectLanguage') || 'en';
        console.log('get DrugsDispensed for selectLanguage', selectLanguage);

        const storeName =
            selectLanguage === 'en'
                ? this.DrugsDispensedStoreName
                : this.DrugsDispensedStoreName + '_fr';

        this.ngxIndexedDBService.getAll(storeName).subscribe((resp) => {
            callback(resp);
        });
    }

    saveApiCall(apiCall: ApiCall): void {
        this.ngxIndexedDBService.add('apicalls', apiCall).subscribe(
            (response) => {
                // console.log('save ok');
                return response;
            },
            (exception) => {
                console.log('saveApiCall error', exception);
            }
        );
    }

    updateApiCall(apiCall: ApiCall) {
        this.ngxIndexedDBService.update('apicalls', apiCall).subscribe(
            (response) => {
                // console.log('update ok');
                return response;
            },
            (exception) => {
                console.log('updateApiCall error => ', exception);
            }
        );
    }

    public getAddVetServices(callback) {
        const targetLanguage = localStorage.getItem('targetLanguage') || 'en';
        console.log('get AddVetServices for targetLanguage', targetLanguage);

        const storeName =
            targetLanguage === 'fr'
                ? this.addVetServiceStoreName + '_fr'
                : this.addVetServiceStoreName;

        return this.ngxIndexedDBService.getAll(storeName).subscribe((resp) => {
            callback(resp);
        });
    }

    // async getAllQuestions(callback) {
    //     let allQuestions = await this.dbService.getAll(this.QuestionsStoreName);
    //     console.log(allQuestions);
    //     callback(allQuestions);
    // }

    /*  public getAddProfServices(callback) {
        this.ngxIndexedDBService
            .getAll(this.addProcServiceStoreName)
            .subscribe((resp) => {
                callback(resp);
            });
    }*/

    public getAddProfServices(callback) {
        const selectLanguage = localStorage.getItem('selectLanguage') || 'en';
        console.log('get AddProfServices for selectLanguage', selectLanguage);

        const storeName =
            selectLanguage === 'en'
                ? this.addProcServiceStoreName
                : this.addProcServiceStoreName + '_fr';

        this.ngxIndexedDBService.getAll(storeName).subscribe((resp) => {
            callback(resp);
        });
    }

    public getPaymentMethods(callback) {
        this.ngxIndexedDBService.getAll('payment_methods').subscribe((resp) => {
            callback(resp);
        });
    }

    public getOpenAppointment(callback, error) {
        this.ngxIndexedDBService.getAll('open-appointment').subscribe(
            (respStatus) => {
                callback(respStatus);
            },
            (err) => {
                error(err);
            }
        );
    }

    public getPreviewAppointment(callback, error) {
        this.ngxIndexedDBService.getAll('preview-appointment').subscribe(
            (respStatus) => {
                callback(respStatus);
            },
            (err) => {
                error(err);
            }
        );
    }

    public setUsername(value) {
        return localStorage.setItem('username', value);
    }

    public getGUID() {
        if (this.demo) {
            // return '{e3573d38-2065-4873-bca2-99a6fe7f9689}'; // fred
            // return '{4a068dea-e039-4943-b96a-49e645d7cf20}'; //catalin
        }

        // return '{FF365593-27AB-4887-AB36-63F6074A0BD2}';

        const guid = localStorage.getItem('guid');
        return guid;
    }

    public setGUID(value) {
        return localStorage.setItem('guid', value);
    }

    public setForceRefresh(value) {
        return localStorage.setItem('force-refresh', value);
    }

    public getEnable_Over_Due_warning_on_Mob() {
        return (
            localStorage.getItem('Enable_Over_Due_warning_on_Mob') === 'true'
        );
    }

    public getAutoUpdate() {
        return localStorage.getItem('auto-update') === ''
            ? true
            : localStorage.getItem('auto-update') === 'true'
            ? true
            : false;
    }

    public setAutoUpdate(value) {
        localStorage.setItem('auto-update', value);
    }

    public setEnable_Cancel_from_Mobile(value) {
        localStorage.setItem('Enable_Cancel_from_Mobile', value);
    }

    public setEnable_Re_scheduling_from_Mob(value) {
        localStorage.setItem('Enable_Re_scheduling_from_Mob', value);
    }

    public setEnable_Summary_Email_from_Mob(value) {
        localStorage.setItem('Enable_Summary_Email_from_Mob', value);
    }

    public setEnable_Over_Due_warning_on_Mob(value) {
        localStorage.setItem('Enable_Over_Due_warning_on_Mob', value);
    }

    public getEnable_Cancel_from_Mobile() {
        return localStorage.getItem('Enable_Cancel_from_Mobile') === 'true';
    }

    public getEnable_Re_scheduling_from_Mob() {
        return localStorage.getItem('Enable_Re_scheduling_from_Mob') === 'true';
    }

    public get(url): Observable<any> {
        try {
            return this.http.get(url).pipe(
                map((res: any) => res),
                catchError(this.handleError)
            );
        } catch (e) {}
    }

    public post(url, data) {
        console.log('posting', url, data);

        try {
            return this.http.post(url, data, httpOptions).pipe(
                map((res: any) => res),
                catchError(this.handleError)
            );
        } catch (e) {
            console.log('error', e);
        }
    }

    public delete(url) {
        try {
            return this.http.delete(url).pipe(
                map((res: any) => res),
                catchError(this.handleError)
            );
        } catch (e) {}
    }

    public deleteOpenAppointment(callback) {
        console.log('deleteOpenAppointment');
        this.ngxIndexedDBService.clear('open-appointment').subscribe(
            () => {
                console.log('clear open appointment success');
                callback();
            },
            (error) => {
                console.log(error);
            }
        );
    }

    public deletePreviewAppointment() {
        this.ngxIndexedDBService.clear('preview-appointment');
    }

    public resetAppointmentByKey(appointmentKey) {
        this.ngxIndexedDBService
            .getByKey(this.appointmentStoreName, appointmentKey)
            .subscribe((result) => {
                if (!result) {
                    return;
                }

                // @ts-ignore
                result.Open = false;
                this.ngxIndexedDBService.update(
                    this.appointmentStoreName,
                    result
                );
            });
    }

    public SendEmailConfirmation(appointment: any, callback: any) {}

    getReadyToSendAppointment(callback) {
        this.ngxIndexedDBService
            .getAll('ready-to-send')
            .subscribe((respStatus) => {
                callback(respStatus);
            });
    }

    async updateWorkOrderStatus(workOrderline, callBack, nn) {
        const getGuid = this.getGUID();
        const data = {
            guidAccessKey: getGuid,
            documentType: workOrderline.Document_Type,
            documentNo: workOrderline.Document_No,
            lineNo: workOrderline.Line_No,
            company: localStorage.getItem('company'),
            workOrderStatus: workOrderline.Work_Order_Status,
        };
        console.log(JSON.stringify(data));

        const url = environment.baseURL + `update-work-order-status`;
        const call = new ApiCall(
            url,
            'update-work-order-status',
            data,
            undefined,
            new Date().getTime(),
            new Date().getDate()
        );

        this.saveApiCall(call);
        callBack(this.idb.addPostData(PostData.create(url, data)));
    }

    public pushReadyToSendAppointment(callback) {
        const reponses = [];

        this.serviceAvailable((haveAccess) => {
            console.log('have access = ', haveAccess);
            if (haveAccess) {
                this.getReadyToSendAppointment((result) => {
                    const postRequest = [];
                    console.log('getReadyToSendAppointment =>', result);

                    result.forEach((line) => {
                        line.Work_Order_Status = 4;
                        this.updateWorkOrderStatus(
                            line,
                            (reponse) => {
                                console.log(
                                    'post work order resulted in ',
                                    reponse
                                );
                                reponses.push(reponse);
                            },
                            (error) => console.log(error)
                        );
                    });

                    callback(reponses);
                });
                console.log('we have access');
            } else {
                console.log('no access');
            }
        });
    }

    updateOutTime(workOrderline) {
        console.log('update out time');
        if (workOrderline.updateOutTime) return;
        workOrderline.updateOutTime = true;
        const getGuid = this.getGUID();
        const data = {
            guidAccessKey: getGuid,
            type: workOrderline.Document_Type,
            documentNo: workOrderline.Document_No,
            company: localStorage.getItem('company'),
            lineNo: workOrderline.RESULT.WORK_LINES[0].Line_No,
            timeOut: ApiCall.formatTime(new Date()),
            data: JSON.stringify(workOrderline)
                .replace(/\/Date/g, '\\/Date')
                .replace(/\)\//g, ')\\/'),
        };

        this.serviceAvailable((result) => {
            if (result) {
                new Promise((resolve: any, reject: any) => {
                    const url = environment.baseURL + `set-outtime`;
                    const call = new ApiCall(
                        url,
                        'set-outtime',
                        data,
                        undefined,
                        new Date().getTime(),
                        new Date().getDate()
                    );
                    this.saveApiCall(call);

                    this.idb
                        .addPostData(PostData.create(url, data))
                        // .then(this.sync.backgroundSync())
                        .catch(console.log());
                    /*this.autoPostIfPossible((r) => resolve(r)).then((r) => {
              this.updateApiCall(call);
          });*/

                    // this.updateApiCall(call);
                }).then((r) => console.log(r));
            }
        });
    }

    public transfertOpenToReady(appointment: any, callback: any) {
        const last =
            appointment.RESULT.WORK_LINES[
                appointment.RESULT.WORK_LINES.length - 1
            ];
        for (let i = 0; i < appointment.RESULT.WORK_LINES.length; i++) {
            console.log(i);
            console.log(appointment.RESULT.WORK_LINES.length);
            this.ngxIndexedDBService
                .add('ready-to-send', appointment.RESULT.WORK_LINES[i])
                .subscribe(
                    (result) => {
                        const docType =
                            appointment.RESULT.WORK_LINES[i].Document_Type;
                        const docNo =
                            appointment.RESULT.WORK_LINES[i].Document_Type;
                        const lineNo = appointment.RESULT.WORK_LINES[i].Line_No;
                        if (
                            appointment.RESULT.WORK_LINES[i].Document_Type ===
                            last.Document_Type
                        ) {
                            if (
                                appointment.RESULT.WORK_LINES[i].Document_No ===
                                last.Document_No
                            ) {
                                if (
                                    appointment.RESULT.WORK_LINES[i].Line_No ===
                                    last.Line_No
                                ) {
                                    callback();
                                    return;
                                }
                            }
                        }
                    },
                    (error) => {
                        console.log(error);
                    }
                );
        }
    }

    public hasOpenAppointment(): boolean {
        return false;
    }

    public reset(storeName: string, callBack: any) {
        this.ngxIndexedDBService.clear(storeName).subscribe(
            () => {
                callBack('success');
            },
            (error) => callBack(error)
        );
    }

    public resetAll(callback) {
        if (navigator.onLine) {
            this.reset(this.appointmentStoreName, (resp) => {});
            this.reset(this.currentWorkOrdersStoreName, (resp) => {});
            this.reset(this.dictionaryStoreName, (resp) => {});
            this.reset(this.emailJobQueueStoreName, (resp) => {});
            this.reset(this.openAppointmentStoreName, (resp) => {});
            this.reset(this.paymentMethodsStoreName, (resp) => {});
            this.reset(this.previewAppointmentStoreName, (resp) => {});
            this.reset(this.readyToSendStoreName, (resp) => {});
            this.reset(this.vetProfTimeStoreName, (resp) => {});
            this.reset(this.treatmentStoreName, (resp) => {});
            this.reset(this.addProcServiceStoreName, (resp) => {});
            this.reset(this.addVetServiceStoreName, (resp) => {});
            this.reset(this.DrugsDispensedStoreName, (resp) => {});
            this.reset(this.DrugsUsedInTreatmentStoreName, (resp) => {});
            this.reset(this.FutureWOStoreName, (resp) => {});
            this.reset(this.storeNamePostData, (resp) => {
                this.localStorageService.setCount(0);
            });
            this.reset(this.offlineCompleted, (resp) => {});
            this.reset('apicalls', (resp) => {});
        }

        callback();
    }

    public deleteAppointmentByKey(appointment: IAppointment, callback) {
        console.log(
            'delete appoint by key',
            appointment.AppointementKey,
            appointment
        );
        this.ngxIndexedDBService
            .delete(this.appointmentStoreName, appointment.AppointementKey)
            .subscribe(() => {
                callback();
            });
    }

    resetDb() {
        if (navigator.onLine) {
            this.resetAll(() => {
                window.location.reload();
            });
        }
    }

    async postOffline(data: OfflinePostData) {
        let ctr = 0;
        let waiting = false;
        if (navigator.onLine) {
            await this.delay(1000);
            console.log('we post', data.value.url, data.value.data);
            console.log('waiting starts');
            while (waiting) {
                await this.delay(500);
                console.log('we wait .5 seconds', ctr++);
            }
            ctr = 0;
            waiting = true;
            this.post(data.value.url, data.value.data).subscribe(
                (resp2: Response) => {
                    console.log('post response is', resp2);
                    waiting = false;
                    console.log('waiting done');
                    this.offlineService.deletedPostDatas.push(data);
                    this.offlineService.deleteOfflinePostData(
                        data,
                        (result) => {
                            console.log('result from delete');
                        }
                    );
                    return true;
                }
            );
            return true;
        }
    }

    addCompleted(questionnaire: Questionnaire) {
        console.log(`add completed ${questionnaire.appointment.Document_No}`);
        this.offlineService.addCompletedRecord(questionnaire.appointment);
        this.ngxIndexedDBService.add(
            'offline-completed',
            questionnaire.appointment
        );
    }

    tryToSetDefaultCompany() {
        if (!localStorage.getItem('company')) {
            this.get(environment.baseURL + `companies-available`).subscribe(
                (data: any) => {
                    console.log('hello');
                    console.log(data);

                    if (data && data.length === 1) {
                        localStorage.setItem('company', data[0]);
                    } else {
                        localStorage.setItem('company', data[2]); // for now just to test
                    }
                },
                (error) => {
                    console.log('error', error);
                }
            );
        }
    }

    private setMaxAnimals(value): void {
        return localStorage.setItem('max_animals', value);
    }

    /*public async autoPostIfPossible(callback) {
      if (!!this.sync.autoposting) {
          alert('no need to autopost now');
          callback(true);
          return;
      }

      alert('set autoposting to true');
      this.sync.autoposting = true;

      this.offlineService
          .getOfflinePostDatas()
          .subscribe((resp: OfflinePostData[]) => {
              alert('response from get offlinepostdatas');
              this.offlineService.offlinePostDatas = resp;
              console.log(`get offline post datas response => `, resp);
              if (!navigator.onLine) {
                  this.snackBar.open(
                      `Synchronizing ${this.offlineService.offlinePostDatas.length} posts`,
                      `ok`,
                      { duration: 500 }
                  );
              }
              if (this.offlineService.offlinePostDatas?.length > 0) {
                  this.offlineService.offlinePostDatas.forEach(
                      async (data, index, array) => {
                          await this.delay(10);
                          setTimeout(() => {
                              this.postOffline(data);
                          }, 1000 * (index + 1));
                      }
                  );
              }

              const newDate = new Date();
              localStorage.setItem(
                  'last_data_sync',
                  ApiCall.formatDate(newDate) +
                      ' ' +
                      ApiCall.formatTime(newDate)
              );

              alert('set autoposting to false');
              this.sync.autoposting = false;

              callback(true);
          });
  }*/

    private handleError(error: any) {
        return observableThrowError(error);
    }

    private delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private serviceAvailable(callback) {
        if (!navigator.onLine) {
            callback(true);
            return;
        }
        console.log('check service available 102030!');
        this.get(
            environment.baseURL +
                `service-available?company=${localStorage.getItem('company')}`
        ).subscribe(
            (data: any) => {
                console.log('it ok!!!');
                callback(data);
            },
            (error: any) => {
                console.log('it NOT ok!!!');
                callback(error);
            }
        );
    }

    private updateCurrentAppoitment(data) {
        console.log('update current appointment', data);
        this.ngxIndexedDBService
            .getAll(this.openAppointmentStoreName)
            .subscribe((apps) => {
                console.log('apps', apps);
                apps.forEach((app: any) => {
                    if (app.Document_No === data.docNo) {
                        if (app.Document_Type === data.docType) {
                            {
                                app.RESULT.WORK_LINES[0].Web_Work_Orders_Result.forEach(
                                    (wwor: IWebWorkOrdersResult) => {
                                        if (
                                            wwor.GUID_Link_Key ===
                                            data.guidLinkKey
                                        ) {
                                            if (wwor.Line_No === data.lineNo) {
                                                if (
                                                    wwor.Question_No ===
                                                    data.questionNo
                                                ) {
                                                    console.log(
                                                        `we update wwor ${wwor.Document_No} ${wwor.Question_No} ${wwor.Line_No}`
                                                    );
                                                    console.log(
                                                        `Integer from ${wwor.Integer} to ${data.newInteger}`
                                                    );
                                                    console.log(
                                                        `Decimal from ${wwor.Decimal} to ${data.newDecimal}`
                                                    );
                                                    console.log(
                                                        `Text from ${wwor.Text} to ${data.newText}`
                                                    );
                                                    console.log(
                                                        `NoYes from ${wwor.No_Yes} to ${data.newNoYes}`
                                                    );
                                                    console.log(
                                                        `ListValue from ${wwor.List_Value_Code} to ${data.newListValueCode}`
                                                    );

                                                    wwor.Integer =
                                                        data.newInteger;
                                                    wwor.Decimal =
                                                        data.newDecimal;
                                                    wwor.Text = data.newText;
                                                    wwor.No_Yes = data.newNoYes;
                                                    wwor.List_Value_Code =
                                                        data.newListValueCode;

                                                    this.ngxIndexedDBService.update(
                                                        this
                                                            .openAppointmentStoreName,
                                                        app
                                                    );

                                                    return;
                                                }
                                            }
                                        }
                                    }
                                );
                            }
                        }
                    }
                });
            });
    }
}
