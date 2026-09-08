import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

const spec = {
	openapi: '3.2.0',
	info: {
		title: 'MotoMate API',
		version: APP_VERSION,
		description:
			'Your digital maintenance journal for your vehicles. All vehicle data, accessible from scripts, automations, and home integrations.\n\nAuthenticate with an API key from **Settings > Developer**.'
	},
	servers: [{ url: '/api/v1' }],
	tags: [
		{ name: 'Profile', description: 'Your account details and data export.' },
		{ name: 'Vehicles', description: 'Your garage. Read vehicle details and current odometer.' },
		{
			name: 'Attention',
			description: 'Everything that needs your attention on a vehicle in a single call.'
		},
		{ name: 'Maintenance', description: 'All trackers with their current status.' },
		{ name: 'Service logs', description: 'Read and write your service history.' },
		{ name: 'Odometer', description: 'Log and retrieve odometer readings.' },
		{ name: 'Spending', description: 'Expenses, fuel costs, and other transactions.' }
	],
	'x-tagGroups': [
		{ name: 'Account', tags: ['Profile'] },
		{
			name: 'Vehicle data',
			tags: ['Vehicles', 'Attention', 'Maintenance', 'Service logs', 'Odometer', 'Spending']
		}
	],
	components: {
		securitySchemes: {
			bearerAuth: {
				type: 'http',
				scheme: 'bearer',
				description: 'API key starting with `mm_`. Create one in Settings > Developer.'
			}
		},
		schemas: {
			Vehicle: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					name: { type: 'string' },
					make: { type: 'string' },
					model: { type: 'string' },
					year: { type: 'integer' },
					type: { type: 'string', enum: ['motorcycle', 'scooter', 'bike', 'other'] },
					current_odometer: { type: 'integer' },
					odometer_unit: { type: 'string' },
					license_plate: { type: 'string', nullable: true },
					vin: { type: 'string', nullable: true },
					archived_at: { type: 'string', format: 'date-time', nullable: true },
					created_at: { type: 'string', format: 'date-time' },
					updated_at: { type: 'string', format: 'date-time' }
				}
			},
			Tracker: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					vehicle_id: { type: 'string' },
					status: { type: 'string', enum: ['ok', 'due', 'overdue'] },
					last_done_at: { type: 'string', format: 'date', nullable: true },
					last_done_odometer: { type: 'integer', nullable: true },
					next_due_at: { type: 'string', format: 'date', nullable: true },
					next_due_odometer: { type: 'integer', nullable: true }
				}
			},
			ServiceLog: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					vehicle_id: { type: 'string' },
					tracker_id: { type: 'string', nullable: true },
					performed_at: { type: 'string', format: 'date' },
					odometer_at_service: { type: 'integer' },
					cost_cents: { type: 'integer', nullable: true },
					currency: { type: 'string' },
					notes: { type: 'string', nullable: true },
					remark: { type: 'string', nullable: true },
					created_at: { type: 'string', format: 'date-time' }
				}
			},
			OdometerLog: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					vehicle_id: { type: 'string' },
					odometer: { type: 'integer' },
					recorded_at: { type: 'string', format: 'date' },
					remark: { type: 'string', nullable: true },
					created_at: { type: 'string', format: 'date-time' }
				}
			},
			FinanceTransaction: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					vehicle_id: { type: 'string' },
					category: {
						type: 'string',
						enum: ['maintenance', 'parts', 'accessories', 'administrative', 'fuel', 'other']
					},
					amount_cents: { type: 'integer' },
					currency: { type: 'string' },
					notes: { type: 'string', nullable: true },
					performed_at: { type: 'string', format: 'date' },
					created_at: { type: 'string', format: 'date-time' }
				}
			},
			VehicleNote: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					vehicle_id: { type: 'string' },
					user_id: { type: 'string' },
					title: { type: 'string', nullable: true },
					content: { type: 'string' },
					doc_refs: { type: 'array', items: { type: 'string' } },
					created_at: { type: 'string', format: 'date-time' },
					updated_at: { type: 'string', format: 'date-time' }
				}
			},
			Error: {
				type: 'object',
				required: ['error', 'code'],
				properties: {
					error: { type: 'string' },
					code: { type: 'string' }
				}
			}
		}
	},
	security: [{ bearerAuth: [] }],
	paths: {
		'/me': {
			get: {
				tags: ['Profile'],
				summary: 'Your profile',
				description: 'Confirm your key is valid and see which account it belongs to.',
				operationId: 'getMe',
				responses: {
					'200': {
						description: 'Profile data',
						content: {
							'application/json': {
								schema: { type: 'object', properties: { data: { type: 'object' } } }
							}
						}
					},
					'401': {
						description: 'Invalid or missing API key',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/me/download': {
			get: {
				tags: ['Profile'],
				summary: 'Request a download link',
				description:
					'Back up your full journal: service history, odometer logs, expenses, and documents. Returns a 15-minute link you can paste into any browser to trigger the download without setting request headers.',
				operationId: 'createDownloadLink',
				parameters: [
					{
						name: 'format',
						in: 'query',
						schema: { type: 'string', enum: ['json', 'zip'], default: 'json' },
						description: '`json` for structured data only. `zip` includes attached documents.'
					}
				],
				responses: {
					'200': {
						description: 'Download link',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: {
												url: { type: 'string', description: 'Visit in any browser to download.' },
												format: { type: 'string', enum: ['json', 'zip'] },
												expires_at: { type: 'string', format: 'date-time' }
											}
										}
									}
								}
							}
						}
					}
				}
			}
		},
		'/vehicles': {
			get: {
				tags: ['Vehicles'],
				summary: 'Your garage',
				description:
					'Your garage in sort order. Each entry includes the current odometer, useful for checking whether maintenance intervals have been crossed since you last looked.',
				operationId: 'listVehicles',
				responses: {
					'200': {
						description: 'List of vehicles',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/Vehicle' } }
									}
								}
							}
						}
					}
				}
			}
		},
		'/vehicles/{id}': {
			get: {
				tags: ['Vehicles'],
				summary: 'A single vehicle',
				description:
					'Full detail on one vehicle: make, model, year, and its latest odometer reading.',
				operationId: 'getVehicle',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				responses: {
					'200': {
						description: 'Vehicle',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/Vehicle' } }
								}
							}
						}
					},
					'404': {
						description: 'Vehicle not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/maintenance': {
			get: {
				tags: ['Maintenance'],
				summary: 'Tracker status',
				description:
					'See whether your oil is due, your chain needs lube, or your brakes are overdue. Tracker status is recalculated on every call so you always see where things stand right now.',
				operationId: 'listTrackers',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				responses: {
					'200': {
						description: 'Trackers with current status',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/Tracker' } }
									}
								}
							}
						}
					}
				}
			}
		},
		'/vehicles/{id}/service-logs': {
			get: {
				tags: ['Service logs'],
				summary: 'Service history',
				description:
					'Everything logged for this vehicle: oil changes, tyre checks, chain lube, and any custom service entries. Newest first.',
				operationId: 'listServiceLogs',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{
						name: 'limit',
						in: 'query',
						schema: { type: 'integer', default: 50, maximum: 200 },
						description: 'Max records to return.'
					},
					{ name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
				],
				responses: {
					'200': {
						description: 'Service logs',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/ServiceLog' } },
										total: { type: 'integer', description: 'Total count across all pages.' }
									}
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['Service logs'],
				summary: 'Add a service entry',
				description:
					'Record that you just serviced your vehicle. Pass `tracker_ids` to close out those maintenance tasks: the tracker resets and the next due date or km is calculated from the service date you supply.',
				operationId: 'createServiceLog',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['performed_at', 'odometer_at_service'],
								properties: {
									performed_at: {
										type: 'string',
										format: 'date',
										example: '2025-05-30',
										description: 'Date the service was performed.'
									},
									odometer_at_service: {
										type: 'integer',
										minimum: 0,
										description: 'Odometer reading at time of service.'
									},
									tracker_ids: {
										type: 'array',
										items: { type: 'string' },
										description: 'First entry becomes the primary tracker reset.'
									},
									cost_cents: { type: 'integer', minimum: 0, nullable: true },
									notes: { type: 'string', maxLength: 2000, nullable: true },
									remark: { type: 'string', maxLength: 200, nullable: true }
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Entry created',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/ServiceLog' } }
								}
							}
						}
					},
					'400': {
						description: 'Validation error',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/service-logs/{logId}': {
			get: {
				tags: ['Service logs'],
				summary: 'A single service entry',
				description: 'Fetch one specific entry from the service history.',
				operationId: 'getServiceLog',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'logId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': {
						description: 'Service log',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/ServiceLog' } }
								}
							}
						}
					},
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			},
			delete: {
				tags: ['Service logs'],
				summary: 'Remove a service entry',
				description:
					'Remove an entry you logged by mistake. Tracker statuses are recalculated after deletion so nothing is left inconsistent.',
				operationId: 'deleteServiceLog',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'logId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': { description: 'Deleted' },
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/odometer': {
			get: {
				tags: ['Odometer'],
				summary: 'Odometer history',
				description:
					'The full reading history for this vehicle. Useful for tracking mileage trends or verifying that an automation logged what you expected.',
				operationId: 'listOdometerLogs',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
					{ name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
				],
				responses: {
					'200': {
						description: 'Odometer logs',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/OdometerLog' } },
										total: { type: 'integer' }
									}
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['Odometer'],
				summary: 'Add a reading',
				description:
					'Log the current reading after a ride. If this is the highest reading on record, maintenance intervals are recalculated against it.',
				operationId: 'addOdometerReading',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['odometer', 'recorded_at'],
								properties: {
									odometer: { type: 'integer', minimum: 0 },
									recorded_at: {
										type: 'string',
										format: 'date',
										example: '2025-05-30',
										description: 'Date the reading was taken.'
									},
									remark: { type: 'string', maxLength: 500, nullable: true }
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Reading recorded',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: {
												odometer: {
													type: 'integer',
													description: 'Recomputed current odometer for this vehicle.'
												}
											}
										}
									}
								}
							}
						}
					},
					'400': {
						description: 'Validation error',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/odometer/{logId}': {
			delete: {
				tags: ['Odometer'],
				summary: 'Remove a reading',
				description:
					'Remove an incorrect reading. The vehicle odometer is recalculated from what remains.',
				operationId: 'deleteOdometerLog',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'logId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': { description: 'Deleted' },
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/finance': {
			get: {
				tags: ['Spending'],
				summary: 'Expense history',
				description:
					'Every cost logged against this vehicle: fuel, parts, insurance, services. The response always includes a `total_cents` that sums all records, not just the current page.',
				operationId: 'listFinanceTransactions',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
					{ name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
				],
				responses: {
					'200': {
						description: 'Finance transactions',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: { $ref: '#/components/schemas/FinanceTransaction' }
										},
										total: { type: 'integer' },
										total_cents: {
											type: 'integer',
											description: 'Sum of all amount_cents across all pages.'
										}
									}
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['Spending'],
				summary: 'Add a transaction',
				description:
					'Log an expense: a tank of fuel, a new tyre, an insurance premium. Amount in cents; negative values for income such as selling a part. Currency follows your account setting.',
				operationId: 'createFinanceTransaction',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['category', 'amount_cents', 'performed_at'],
								properties: {
									category: {
										type: 'string',
										enum: [
											'maintenance',
											'parts',
											'accessories',
											'administrative',
											'fuel',
											'other'
										],
										default: 'other'
									},
									amount_cents: {
										type: 'integer',
										description: 'Amount in cents. Use negative values for income/sale.'
									},
									performed_at: { type: 'string', format: 'date', example: '2025-05-30' },
									notes: { type: 'string', maxLength: 500, nullable: true },
									odometer_at_transaction: { type: 'integer', minimum: 0, nullable: true }
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Transaction created',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/FinanceTransaction' } }
								}
							}
						}
					},
					'400': {
						description: 'Validation error',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/finance/{transactionId}': {
			delete: {
				tags: ['Spending'],
				summary: 'Remove a transaction',
				description: 'Remove an expense you logged by mistake.',
				operationId: 'deleteFinanceTransaction',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'transactionId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': { description: 'Deleted' },
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/attention': {
			get: {
				tags: ['Attention'],
				summary: 'Attention across your garage',
				description:
					'The equivalent of glancing across your garage before heading out. Returns every vehicle that has at least one overdue, due, or upcoming item. Vehicles with nothing to report are excluded.',
				operationId: 'listAttention',
				responses: {
					'200': {
						description: 'Attention across all vehicles',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													vehicle_id: { type: 'string' },
													vehicle_name: { type: 'string' },
													current_odometer: { type: 'integer' },
													odometer_unit: { type: 'string' },
													overdue: { type: 'array', items: { type: 'object' } },
													due: { type: 'array', items: { type: 'object' } },
													upcoming: { type: 'array', items: { type: 'object' } }
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		},
		'/vehicles/{id}/attention': {
			get: {
				tags: ['Attention'],
				summary: 'Attention for this vehicle',
				description:
					"Scoped to one vehicle. Returns what is overdue, due now, and coming up within 14 days or 500 km (10 h for hour-based vehicles). Each item includes fields like `overdue_by` and `due_in_days` so you know exactly how far past due your chain lube is. Values are in the vehicle's `odometer_unit`. For all vehicles at once, use `GET /vehicles/attention`.",
				operationId: 'getVehicleAttention',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				responses: {
					'200': {
						description: 'Attention summary',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: {
												current_odometer: { type: 'integer' },
												odometer_unit: { type: 'string' },
												overdue: {
													type: 'array',
													items: {
														type: 'object',
														properties: {
															id: { type: 'string' },
															name: { type: 'string' },
															status: { type: 'string', enum: ['overdue'] },
															next_due_at: { type: 'string', format: 'date', nullable: true },
															next_due_odometer: { type: 'integer', nullable: true },
															last_done_at: { type: 'string', format: 'date', nullable: true },
															last_done_odometer: { type: 'integer', nullable: true },
															overdue_by: {
																type: 'integer',
																description:
																	'units past due — km, mi, or h depending on odometer_unit'
															},
															overdue_by_days: {
																type: 'integer',
																description: 'days past due date'
															}
														}
													}
												},
												due: {
													type: 'array',
													items: {
														type: 'object',
														properties: {
															id: { type: 'string' },
															name: { type: 'string' },
															status: { type: 'string', enum: ['due'] },
															next_due_at: { type: 'string', format: 'date', nullable: true },
															next_due_odometer: { type: 'integer', nullable: true },
															due_in: {
																type: 'integer',
																description:
																	'units until due — km, mi, or h depending on odometer_unit'
															},
															due_in_days: { type: 'integer' }
														}
													}
												},
												upcoming: {
													type: 'array',
													items: {
														type: 'object',
														properties: {
															id: { type: 'string' },
															name: { type: 'string' },
															status: { type: 'string', enum: ['ok'] },
															next_due_at: { type: 'string', format: 'date', nullable: true },
															next_due_odometer: { type: 'integer', nullable: true },
															due_in: {
																type: 'integer',
																description:
																	'units until due — km, mi, or h depending on odometer_unit'
															},
															due_in_days: { type: 'integer' }
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		},
		'/vehicles/{id}/notes': {
			get: {
				tags: ['Notes'],
				summary: 'List notes',
				description:
					'All notes for this vehicle, newest first. Notes may contain Markdown and embedded document reference links.',
				operationId: 'listVehicleNotes',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
					{ name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
				],
				responses: {
					'200': {
						description: 'Notes list',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: { type: 'array', items: { $ref: '#/components/schemas/VehicleNote' } },
										total: { type: 'integer' }
									}
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['Notes'],
				summary: 'Create a note',
				description:
					'Add a Markdown note to this vehicle. Use `doc_refs` to track which document IDs are referenced in the note content.',
				operationId: 'createVehicleNote',
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['content'],
								properties: {
									title: { type: 'string', maxLength: 200, nullable: true },
									content: { type: 'string', maxLength: 50000 },
									doc_refs: {
										type: 'array',
										items: { type: 'string' },
										description: 'Document IDs referenced in the note content.'
									}
								}
							}
						}
					}
				},
				responses: {
					'201': {
						description: 'Note created',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/VehicleNote' } }
								}
							}
						}
					},
					'400': {
						description: 'Validation error',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		},
		'/vehicles/{id}/notes/{noteId}': {
			get: {
				tags: ['Notes'],
				summary: 'Get a note',
				operationId: 'getVehicleNote',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': {
						description: 'Note',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { data: { $ref: '#/components/schemas/VehicleNote' } }
								}
							}
						}
					},
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			},
			patch: {
				tags: ['Notes'],
				summary: 'Update a note',
				operationId: 'updateVehicleNote',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									title: { type: 'string', maxLength: 200, nullable: true },
									content: { type: 'string', maxLength: 50000 },
									doc_refs: { type: 'array', items: { type: 'string' } }
								}
							}
						}
					}
				},
				responses: {
					'200': { description: 'Updated' },
					'400': {
						description: 'Validation error',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					},
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			},
			delete: {
				tags: ['Notes'],
				summary: 'Delete a note',
				operationId: 'deleteVehicleNote',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }
				],
				responses: {
					'200': { description: 'Deleted' },
					'404': {
						description: 'Not found',
						content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
					}
				}
			}
		}
	},
	webhooks: {
		notification: {
			post: {
				summary: 'Workflow notification',
				description:
					'Sent by MotoMate to the URL you set in Settings > Workflows whenever one of your rules fires. This is a request your endpoint receives, not one you call.\n\nThe `Authorization` header is whatever you entered alongside the URL, sent verbatim. Redirects are not followed, the request times out after 5 seconds, and any non-2xx response is logged and dropped without a retry, so treat delivery as best effort.',
				operationId: 'workflowNotification',
				security: [],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['event', 'title', 'body', 'vehicle_name', 'timestamp', 'data'],
								properties: {
									event: { type: 'string', enum: ['motomate_notification'] },
									title: { type: 'string', example: 'Chain lube overdue' },
									body: { type: 'string', example: 'CB500F is 100 km past due for chain lube.' },
									vehicle_name: { type: 'string', example: 'CB500F' },
									timestamp: { type: 'string', format: 'date-time' },
									data: {
										type: 'object',
										description:
											'Template variables for the rule that fired. Always includes `vehicle_name`; the rest depend on the trigger.',
										additionalProperties: { type: ['string', 'number'] }
									}
								}
							}
						}
					}
				},
				responses: {
					'2XX': {
						description: 'Any 2xx counts as delivered. Anything else is logged and dropped.'
					}
				}
			}
		}
	}
};

export const GET: RequestHandler = async () => {
	return json(spec, {
		headers: {
			'Cache-Control': 'public, max-age=300'
		}
	});
};
